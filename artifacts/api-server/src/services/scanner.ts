import { db } from "@workspace/db";
import {
  coinsTable,
  marketSnapshotsTable,
  signalsTable,
  paperTradesTable,
  watchlistTable,
} from "@workspace/db";
import { eq, and, count, gte, desc, lt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { analyzeForLong, analyzeForShort, CandleData, scoreToConfidence } from "./signal-engine";
import { Telegram } from "./telegram";
import { reviewClosedTrade } from "./learning-engine";
import { riskManager } from "./risk-manager";

const BINANCE_BASE = "https://fapi.binance.com";
const SCAN_INTERVAL_MS = 30_000;
const MIN_VOLUME_24H = 50_000_000;
const MIN_RVOL = 1.3;
const MAX_OPEN_TRADES = 3;
const MAX_DAILY_TRADES = 5;
const MAX_WEEKLY_TRADES = 15;
const MIN_SCORE_TRADE = 90;
const MIN_SCORE_WATCHLIST = 80;

interface TickerData {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
}

export class ScannerService {
  private static instance: ScannerService;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private lastScanAt: string | null = null;
  private scanStart: number | null = null;

  static getInstance(): ScannerService {
    if (!ScannerService.instance) {
      ScannerService.instance = new ScannerService();
    }
    return ScannerService.instance;
  }

  getStatus() {
    const nextScanIn = this.scanStart && this.running
      ? Math.max(0, Math.round((this.scanStart + SCAN_INTERVAL_MS - Date.now()) / 1000))
      : null;
    return { running: this.running, lastScanAt: this.lastScanAt, nextScanIn };
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await Telegram.scannerStarted();
    logger.info("Scanner started");
    await this.scan();
    this.scheduleNext();
  }

  stop() {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    Telegram.scannerStopped().catch(() => {});
    logger.info("Scanner stopped");
  }

  private scheduleNext() {
    if (!this.running) return;
    this.scanStart = Date.now();
    this.timer = setTimeout(async () => {
      if (!this.running) return;
      await this.scan();
      this.scheduleNext();
    }, SCAN_INTERVAL_MS);
  }

  private async scan() {
    try {
      logger.info("Starting market scan (v2.0)");
      const tickers = await this.fetchAllTickers();
      if (!tickers || tickers.length === 0) return;

      const usdtPairs = tickers.filter(t =>
        t.symbol.endsWith("USDT") &&
        !t.symbol.startsWith("BTC") &&
        !t.symbol.startsWith("1000") &&
        Number(t.quoteVolume) >= MIN_VOLUME_24H
      );

      await this.syncCoins(usdtPairs);

      const sorted = [...usdtPairs].sort((a, b) =>
        Number(b.priceChangePercent) - Number(a.priceChangePercent)
      );
      const gainers = sorted.slice(0, 20);
      const losers = sorted.slice(-20).reverse();

      this.lastScanAt = new Date().toISOString();
      await this.saveSnapshots(gainers, "gainer");
      await this.saveSnapshots(losers, "loser");

      // Expire old watchlist items
      await this.expireWatchlist();

      const riskCheck = await riskManager.canTrade();

      for (const ticker of gainers.slice(0, 10)) {
        await this.analyzeSymbol(ticker, "LONG", riskCheck.allowed);
        await sleep(300);
      }

      for (const ticker of losers.slice(0, 10)) {
        await this.analyzeSymbol(ticker, "SHORT", riskCheck.allowed);
        await sleep(300);
      }

      // Re-check watchlist items
      await this.checkWatchlist(tickers);

      logger.info({ gainers: gainers.length, losers: losers.length }, "Scan v2 complete");
    } catch (err) {
      logger.error({ err }, "Scan failed");
    }
  }

  private async fetchAllTickers(): Promise<TickerData[]> {
    const res = await fetch(`${BINANCE_BASE}/fapi/v1/ticker/24hr`);
    if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
    return res.json();
  }

  private async fetchCandles(symbol: string, interval = "15m", limit = 100): Promise<CandleData[]> {
    const url = `${BINANCE_BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw: any[][] = await res.json();
    return raw.map(c => ({
      timestamp: c[0],
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }));
  }

  private async syncCoins(tickers: TickerData[]) {
    for (const t of tickers) {
      const baseAsset = t.symbol.replace("USDT", "");
      await db.insert(coinsTable).values({
        symbol: t.symbol, baseAsset, quoteAsset: "USDT", isActive: true,
        lastPrice: t.lastPrice, volume24h: t.quoteVolume, priceChangePercent: t.priceChangePercent,
      }).onConflictDoUpdate({
        target: coinsTable.symbol,
        set: { lastPrice: t.lastPrice, volume24h: t.quoteVolume, priceChangePercent: t.priceChangePercent, updatedAt: new Date() },
      });
    }
  }

  private async saveSnapshots(tickers: TickerData[], listType: "gainer" | "loser") {
    for (let i = 0; i < tickers.length; i++) {
      const t = tickers[i];
      const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, t.symbol));
      if (!coin) continue;
      await db.insert(marketSnapshotsTable).values({
        coinId: coin.id, symbol: t.symbol, price: t.lastPrice,
        priceChangePercent: t.priceChangePercent, volume24h: t.quoteVolume,
        rvol: "1.5", rank: i + 1, listType, scannedAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  private async analyzeSymbol(ticker: TickerData, direction: "LONG" | "SHORT", canOpenTrade: boolean) {
    const symbol = ticker.symbol;
    const currentPrice = Number(ticker.lastPrice);
    const volume24h = Number(ticker.quoteVolume);

    try {
      // Pre-filter with quick RVOL check on 15m
      const candles15m = await this.fetchCandles(symbol, "15m", 100);
      if (candles15m.length < 60) return;

      const avgVol = candles15m.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20;
      const rvol = avgVol > 0 ? candles15m[candles15m.length - 1].volume / avgVol : 1;
      if (rvol < MIN_RVOL) return;

      // Fetch all timeframes for multi-TF analysis
      const [candles5m, candlesH1] = await Promise.all([
        this.fetchCandles(symbol, "5m", 60),
        this.fetchCandles(symbol, "1h", 50),
      ]);

      const mtf = { m5: candles5m, h1: candlesH1, m1: [] };

      // Check for existing active signal (avoid duplicates)
      const existingSignal = await db.select().from(signalsTable)
        .where(and(eq(signalsTable.symbol, symbol), eq(signalsTable.status, "active")));
      if (existingSignal.length > 0) return;

      const analysis = direction === "LONG"
        ? analyzeForLong(symbol, candles15m, currentPrice, volume24h, mtf)
        : analyzeForShort(symbol, candles15m, currentPrice, volume24h, mtf);

      if (!analysis) return;

      if (analysis.score >= MIN_SCORE_TRADE) {
        // A/A+ signal — try to open a trade
        const canTrade = await this.checkTradingLimits();
        if (!canTrade) {
          // Save as signal but don't open trade
          await this.saveSignal(symbol, analysis, "active");
          return;
        }

        if (!canOpenTrade) {
          logger.info({ symbol, reason: "risk manager paused" }, "Skipping trade — risk manager paused");
          await this.saveSignal(symbol, analysis, "active");
          return;
        }

        const newSignal = await this.saveSignal(symbol, analysis, "active");
        await Telegram.signalCreated({
          symbol, direction: analysis.direction, score: analysis.score,
          grade: analysis.grade!, confidence: analysis.confidence,
          setupType: analysis.setupType,
          entryPrice: analysis.entryPrice, stopLoss: analysis.stopLoss,
          tp1: analysis.tp1, tp2: analysis.tp2, tp3: analysis.tp3,
          rrRatio: analysis.rrRatio, reason: analysis.reason,
          whyNow: analysis.whyNow, timeframeAlignment: analysis.timeframeAlignment,
        });
        await this.openPaperTrade(newSignal, analysis);

      } else if (analysis.score >= MIN_SCORE_WATCHLIST) {
        // Near-miss — add to watchlist
        await this.addToWatchlist(symbol, analysis);
      }

    } catch (err) {
      logger.error({ err, symbol }, "Failed to analyze symbol");
    }
  }

  private async saveSignal(symbol: string, analysis: any, status: string) {
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const [newSignal] = await db.insert(signalsTable).values({
      symbol, direction: analysis.direction, score: String(analysis.score),
      grade: analysis.grade!, confidence: analysis.confidence,
      setupType: analysis.setupType,
      entryPrice: String(analysis.entryPrice), stopLoss: String(analysis.stopLoss),
      tp1: String(analysis.tp1), tp2: String(analysis.tp2), tp3: String(analysis.tp3),
      rrRatio: String(analysis.rrRatio), status,
      reason: analysis.reason, slReason: analysis.slReason,
      whyNow: analysis.whyNow, whyNotEarlier: analysis.whyNotEarlier,
      whyLong: analysis.whyLong, whySl: analysis.whySl, whyTp: analysis.whyTp,
      timeframeAlignment: analysis.timeframeAlignment,
      trendScore: String(analysis.trendScore), emaScore: String(analysis.emaScore),
      volumeScore: String(analysis.volumeScore), rvolScore: String(analysis.rvolScore),
      breakoutScore: String(analysis.breakoutScore), retestScore: String(analysis.retestScore),
      structureScore: String(analysis.structureScore), momentumScore: String(analysis.momentumScore),
      expiresAt,
    }).returning();
    return newSignal;
  }

  private async openPaperTrade(signal: any, analysis: any) {
    const tradeId = `PT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const [trade] = await db.insert(paperTradesTable).values({
      tradeId, signalId: signal.id, symbol: signal.symbol,
      direction: signal.direction,
      setupType: analysis.setupType, confidence: analysis.confidence,
      entryPrice: String(analysis.entryPrice), stopLoss: String(analysis.stopLoss),
      currentSl: String(analysis.stopLoss),
      tp1: String(analysis.tp1), tp2: String(analysis.tp2), tp3: String(analysis.tp3),
      quantity: "1", signalScore: String(analysis.score), signalGrade: analysis.grade,
      reason: analysis.reason, slReason: analysis.slReason, status: "open",
    }).returning();

    await db.update(signalsTable).set({ status: "traded" }).where(eq(signalsTable.id, signal.id));

    await riskManager.recordTradeOpened();

    await Telegram.tradeOpened({
      tradeId, symbol: signal.symbol, direction: signal.direction,
      setupType: analysis.setupType, confidence: analysis.confidence,
      entryPrice: analysis.entryPrice, stopLoss: analysis.stopLoss,
      tp1: analysis.tp1, tp2: analysis.tp2, tp3: analysis.tp3,
      signalScore: analysis.score, reason: analysis.reason, rrRatio: analysis.rrRatio,
    });

    logger.info({ tradeId, symbol: signal.symbol, direction: signal.direction, setupType: analysis.setupType }, "Paper trade opened");
    return trade;
  }

  private async addToWatchlist(symbol: string, analysis: any) {
    const existing = await db.select().from(watchlistTable)
      .where(and(eq(watchlistTable.symbol, symbol), eq(watchlistTable.isActive, true)));
    if (existing.length > 0) return;

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await db.insert(watchlistTable).values({
      symbol, direction: analysis.direction, score: String(analysis.score),
      confidence: analysis.confidence, setupType: analysis.setupType,
      entryPrice: String(analysis.entryPrice), stopLoss: String(analysis.stopLoss),
      tp1: String(analysis.tp1), tp2: String(analysis.tp2), tp3: String(analysis.tp3),
      rrRatio: String(analysis.rrRatio), reason: analysis.reason,
      isActive: true, promoted: false, expiresAt,
    });

    await Telegram.watchlistAdded(symbol, analysis.direction, analysis.score, analysis.setupType);
    logger.info({ symbol, score: analysis.score, setupType: analysis.setupType }, "Added to watchlist");
  }

  private async checkWatchlist(tickers: TickerData[]) {
    const items = await db.select().from(watchlistTable).where(eq(watchlistTable.isActive, true));
    if (items.length === 0) return;

    const priceMap = new Map(tickers.map(t => [t.symbol, t]));

    for (const item of items) {
      const ticker = priceMap.get(item.symbol);
      if (!ticker) continue;

      try {
        const candles15m = await this.fetchCandles(item.symbol, "15m", 100);
        if (candles15m.length < 60) continue;

        const [candles5m, candlesH1] = await Promise.all([
          this.fetchCandles(item.symbol, "5m", 60),
          this.fetchCandles(item.symbol, "1h", 50),
        ]);

        const mtf = { m5: candles5m, h1: candlesH1, m1: [] };
        const currentPrice = Number(ticker.lastPrice);
        const volume24h = Number(ticker.quoteVolume);

        const analysis = item.direction === "LONG"
          ? analyzeForLong(item.symbol, candles15m, currentPrice, volume24h, mtf)
          : analyzeForShort(item.symbol, candles15m, currentPrice, volume24h, mtf);

        if (!analysis) continue;

        if (analysis.score >= MIN_SCORE_TRADE) {
          // Promoted from watchlist!
          await db.update(watchlistTable).set({ isActive: false, promoted: true }).where(eq(watchlistTable.id, item.id));
          logger.info({ symbol: item.symbol, score: analysis.score }, "Watchlist item promoted to signal");

          const riskCheck = await riskManager.canTrade();
          const canTrade = await this.checkTradingLimits();
          if (riskCheck.allowed && canTrade) {
            const newSignal = await this.saveSignal(item.symbol, analysis, "active");
            await Telegram.signalCreated({
              symbol: item.symbol, direction: analysis.direction, score: analysis.score,
              grade: analysis.grade!, confidence: analysis.confidence,
              setupType: analysis.setupType, entryPrice: analysis.entryPrice,
              stopLoss: analysis.stopLoss, tp1: analysis.tp1, tp2: analysis.tp2, tp3: analysis.tp3,
              rrRatio: analysis.rrRatio, reason: analysis.reason,
              whyNow: `🔼 Promoted from Watchlist! ${analysis.whyNow}`,
              timeframeAlignment: analysis.timeframeAlignment,
            });
            await this.openPaperTrade(newSignal, analysis);
          }
        }
        await sleep(200);
      } catch (err) {
        logger.error({ err, symbol: item.symbol }, "Watchlist check failed");
      }
    }
  }

  private async expireWatchlist() {
    const now = new Date();
    await db.update(watchlistTable)
      .set({ isActive: false })
      .where(and(eq(watchlistTable.isActive, true), lt(watchlistTable.expiresAt!, now)));
  }

  private async checkTradingLimits(): Promise<boolean> {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);

    const [openCount] = await db.select({ c: count() }).from(paperTradesTable).where(eq(paperTradesTable.status, "open"));
    if (Number(openCount.c) >= MAX_OPEN_TRADES) { logger.info({ open: openCount.c }, "Max open trades reached"); return false; }

    const [dailyCount] = await db.select({ c: count() }).from(paperTradesTable).where(gte(paperTradesTable.openedAt, today));
    if (Number(dailyCount.c) >= MAX_DAILY_TRADES) { logger.info({ daily: dailyCount.c }, "Max daily trades reached"); return false; }

    const [weeklyCount] = await db.select({ c: count() }).from(paperTradesTable).where(gte(paperTradesTable.openedAt, weekStart));
    if (Number(weeklyCount.c) >= MAX_WEEKLY_TRADES) { logger.info({ weekly: weeklyCount.c }, "Max weekly trades reached"); return false; }

    return true;
  }

  // After a trade closes — update risk manager
  async onTradeClosed(result: string) {
    await riskManager.recordTradeClosed(result);
  }
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
