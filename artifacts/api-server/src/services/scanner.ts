import { db } from "@workspace/db";
import {
  coinsTable,
  marketSnapshotsTable,
  signalsTable,
  paperTradesTable,
} from "@workspace/db";
import { eq, and, count, gte, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { analyzeForLong, analyzeForShort, CandleData } from "./signal-engine";
import { Telegram } from "./telegram";
import { reviewClosedTrade } from "./learning-engine";

const BINANCE_BASE = "https://fapi.binance.com";
const SCAN_INTERVAL_MS = 60_000;
const MIN_VOLUME_24H = 50_000_000;
const MIN_RVOL = 1.5;
const MAX_OPEN_TRADES = 3;
const MAX_DAILY_TRADES = 5;
const MAX_WEEKLY_TRADES = 15;

interface TickerData {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
}

interface BinanceCandle {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export class ScannerService {
  private static instance: ScannerService;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private lastScanAt: string | null = null;
  private nextScanIn: number | null = null;
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
    return {
      running: this.running,
      lastScanAt: this.lastScanAt,
      nextScanIn,
    };
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
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
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
      logger.info("Starting market scan");
      const tickers = await this.fetchAllTickers();
      if (!tickers || tickers.length === 0) {
        logger.warn("No tickers returned from Binance");
        return;
      }

      // Filter USDT perp pairs, exclude BTC and BTCUSDT influence
      const usdtPairs = tickers.filter(t =>
        t.symbol.endsWith("USDT") &&
        !t.symbol.startsWith("BTC") &&
        !t.symbol.startsWith("1000") &&
        Number(t.quoteVolume) >= MIN_VOLUME_24H
      );

      // Sync coins to DB
      await this.syncCoins(usdtPairs);

      // Sort by priceChangePercent
      const sorted = [...usdtPairs].sort((a, b) =>
        Number(b.priceChangePercent) - Number(a.priceChangePercent)
      );

      const gainers = sorted.slice(0, 20);
      const losers = sorted.slice(-20).reverse();

      this.lastScanAt = new Date().toISOString();

      // Save snapshots for gainers
      await this.saveSnapshots(gainers, "gainer");
      // Save snapshots for losers
      await this.saveSnapshots(losers, "loser");

      // Send Telegram updates
      await Telegram.gainersUpdated(gainers.slice(0, 5).map(g => ({
        symbol: g.symbol,
        priceChangePercent: Number(g.priceChangePercent),
        rvol: 1.5, // Approximate
      })));
      await Telegram.losersUpdated(losers.slice(0, 5).map(g => ({
        symbol: g.symbol,
        priceChangePercent: Number(g.priceChangePercent),
        rvol: 1.5,
      })));

      // Check trading limits before analyzing
      const canTrade = await this.checkTradingLimits();
      if (!canTrade) {
        logger.info("Trading limits reached — skipping signal analysis");
        return;
      }

      // Analyze top gainers for LONG signals
      for (const ticker of gainers.slice(0, 10)) {
        await this.analyzeSymbol(ticker, "LONG");
        await sleep(200); // Rate limit
      }

      // Analyze top losers for SHORT signals
      for (const ticker of losers.slice(0, 10)) {
        await this.analyzeSymbol(ticker, "SHORT");
        await sleep(200);
      }

      // Check open trades for TP/SL hits
      await this.monitorOpenTrades(tickers);

      logger.info({ gainers: gainers.length, losers: losers.length }, "Scan complete");
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
      await db
        .insert(coinsTable)
        .values({
          symbol: t.symbol,
          baseAsset,
          quoteAsset: "USDT",
          isActive: true,
          lastPrice: t.lastPrice,
          volume24h: t.quoteVolume,
          priceChangePercent: t.priceChangePercent,
        })
        .onConflictDoUpdate({
          target: coinsTable.symbol,
          set: {
            lastPrice: t.lastPrice,
            volume24h: t.quoteVolume,
            priceChangePercent: t.priceChangePercent,
            updatedAt: new Date(),
          },
        });
    }
  }

  private async saveSnapshots(tickers: TickerData[], listType: "gainer" | "loser") {
    for (let i = 0; i < tickers.length; i++) {
      const t = tickers[i];
      const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, t.symbol));
      if (!coin) continue;

      await db.insert(marketSnapshotsTable).values({
        coinId: coin.id,
        symbol: t.symbol,
        price: t.lastPrice,
        priceChangePercent: t.priceChangePercent,
        volume24h: t.quoteVolume,
        rvol: "1.5", // Will be updated from candle analysis
        rank: i + 1,
        listType,
        scannedAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  private async analyzeSymbol(ticker: TickerData, direction: "LONG" | "SHORT") {
    const symbol = ticker.symbol;
    const currentPrice = Number(ticker.lastPrice);
    const volume24h = Number(ticker.quoteVolume);

    try {
      const candles = await this.fetchCandles(symbol, "15m", 100);
      if (candles.length < 60) return;

      // Calculate real RVOL
      const avgVol = candles.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20;
      const currentVol = candles[candles.length - 1].volume;
      const rvol = avgVol > 0 ? currentVol / avgVol : 1;

      if (rvol < MIN_RVOL) return;

      // Check for existing active signal
      const existingSignal = await db.select().from(signalsTable)
        .where(and(eq(signalsTable.symbol, symbol), eq(signalsTable.status, "active")));
      if (existingSignal.length > 0) return;

      let analysis = null;
      if (direction === "LONG") {
        analysis = analyzeForLong(symbol, candles, currentPrice, volume24h);
      } else {
        analysis = analyzeForShort(symbol, candles, currentPrice, volume24h);
      }

      if (!analysis) return;

      // Check if we can open another trade
      const canTrade = await this.checkTradingLimits();
      if (!canTrade) return;

      // Save signal
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours

      const [newSignal] = await db.insert(signalsTable).values({
        symbol,
        direction: analysis.direction,
        score: String(analysis.score),
        grade: analysis.grade!,
        entryPrice: String(analysis.entryPrice),
        stopLoss: String(analysis.stopLoss),
        tp1: String(analysis.tp1),
        tp2: String(analysis.tp2),
        tp3: String(analysis.tp3),
        rrRatio: String(analysis.rrRatio),
        status: "active",
        reason: analysis.reason,
        slReason: analysis.slReason,
        trendScore: String(analysis.trendScore),
        structureScore: String(analysis.structureScore),
        volumeScore: String(analysis.volumeScore),
        breakoutScore: String(analysis.breakoutScore),
        retestScore: String(analysis.retestScore),
        expiresAt,
      }).returning();

      await Telegram.signalCreated({
        symbol,
        direction: analysis.direction,
        score: analysis.score,
        grade: analysis.grade!,
        entryPrice: analysis.entryPrice,
        stopLoss: analysis.stopLoss,
        tp1: analysis.tp1,
        tp2: analysis.tp2,
        tp3: analysis.tp3,
        rrRatio: analysis.rrRatio,
        reason: analysis.reason,
      });

      // Open paper trade immediately
      await this.openPaperTrade(newSignal, analysis);
    } catch (err) {
      logger.error({ err, symbol }, "Failed to analyze symbol");
    }
  }

  private async openPaperTrade(signal: any, analysis: any) {
    const tradeId = `PT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const [trade] = await db.insert(paperTradesTable).values({
      tradeId,
      signalId: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrice: String(analysis.entryPrice),
      stopLoss: String(analysis.stopLoss),
      currentSl: String(analysis.stopLoss),
      tp1: String(analysis.tp1),
      tp2: String(analysis.tp2),
      tp3: String(analysis.tp3),
      quantity: "1",
      signalScore: String(analysis.score),
      signalGrade: analysis.grade,
      reason: analysis.reason,
      slReason: analysis.slReason,
      status: "open",
    }).returning();

    await db.update(signalsTable).set({ status: "traded" }).where(eq(signalsTable.id, signal.id));

    await Telegram.tradeOpened({
      tradeId,
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrice: analysis.entryPrice,
      stopLoss: analysis.stopLoss,
      tp1: analysis.tp1,
      tp2: analysis.tp2,
      tp3: analysis.tp3,
      signalScore: analysis.score,
      reason: analysis.reason,
    });

    logger.info({ tradeId, symbol: signal.symbol, direction: signal.direction }, "Paper trade opened");
  }

  private async monitorOpenTrades(tickers: TickerData[]) {
    const openTrades = await db.select().from(paperTradesTable).where(eq(paperTradesTable.status, "open"));
    const priceMap = new Map(tickers.map(t => [t.symbol, Number(t.lastPrice)]));

    for (const trade of openTrades) {
      const currentPrice = priceMap.get(trade.symbol);
      if (!currentPrice) continue;

      const entryPrice = Number(trade.entryPrice);
      const stopLoss = Number(trade.currentSl ?? trade.stopLoss);
      const tp1 = Number(trade.tp1);
      const tp2 = Number(trade.tp2);
      const tp3 = Number(trade.tp3);

      let exitPrice: number | null = null;
      let exitReason: string | null = null;
      let tp1Hit = trade.tp1Hit;
      let tp2Hit = trade.tp2Hit;
      let tp3Hit = trade.tp3Hit;
      let newSl = stopLoss;

      if (trade.direction === "LONG") {
        if (currentPrice <= stopLoss) {
          exitPrice = stopLoss;
          exitReason = "Stop loss hit";
          await Telegram.slHit(trade.tradeId, trade.symbol, stopLoss);
        } else if (!tp1Hit && currentPrice >= tp1) {
          tp1Hit = true;
          newSl = entryPrice; // Move to break-even
          await Telegram.tp1Hit(trade.tradeId, trade.symbol, currentPrice);
        } else if (tp1Hit && !tp2Hit && currentPrice >= tp2) {
          tp2Hit = true;
          newSl = tp1;
          await Telegram.tp2Hit(trade.tradeId, trade.symbol, currentPrice);
        } else if (tp2Hit && !tp3Hit && currentPrice >= tp3) {
          tp3Hit = true;
          exitPrice = tp3;
          exitReason = "TP3 reached";
          await Telegram.tp3Hit(trade.tradeId, trade.symbol, currentPrice);
        }
      } else { // SHORT
        if (currentPrice >= stopLoss) {
          exitPrice = stopLoss;
          exitReason = "Stop loss hit";
          await Telegram.slHit(trade.tradeId, trade.symbol, stopLoss);
        } else if (!tp1Hit && currentPrice <= tp1) {
          tp1Hit = true;
          newSl = entryPrice; // Move to break-even
          await Telegram.tp1Hit(trade.tradeId, trade.symbol, currentPrice);
        } else if (tp1Hit && !tp2Hit && currentPrice <= tp2) {
          tp2Hit = true;
          newSl = tp1;
          await Telegram.tp2Hit(trade.tradeId, trade.symbol, currentPrice);
        } else if (tp2Hit && !tp3Hit && currentPrice <= tp3) {
          tp3Hit = true;
          exitPrice = tp3;
          exitReason = "TP3 reached";
          await Telegram.tp3Hit(trade.tradeId, trade.symbol, currentPrice);
        }
      }

      // Update TP hits and SL
      await db.update(paperTradesTable).set({
        tp1Hit,
        tp2Hit,
        tp3Hit,
        currentSl: String(newSl),
      }).where(eq(paperTradesTable.id, trade.id));

      // Close trade if exit triggered
      if (exitPrice !== null && exitReason !== null) {
        const pnl = trade.direction === "LONG"
          ? (exitPrice - entryPrice) * Number(trade.quantity)
          : (entryPrice - exitPrice) * Number(trade.quantity);
        const pnlPercent = (pnl / (entryPrice * Number(trade.quantity))) * 100;

        let result: string;
        if (Math.abs(pnl) < 0.0001) result = "BREAKEVEN";
        else if (pnl > 0) result = "WIN";
        else result = "LOSS";

        const now = new Date();
        const durationMinutes = Math.round((now.getTime() - new Date(trade.openedAt).getTime()) / 60000);

        const [closed] = await db.update(paperTradesTable).set({
          status: "closed",
          result,
          exitPrice: String(exitPrice),
          exitReason,
          pnl: String(pnl),
          pnlPercent: String(pnlPercent),
          holdingDurationMinutes: durationMinutes,
          closedAt: now,
          tp1Hit,
          tp2Hit,
          tp3Hit,
        }).where(eq(paperTradesTable.id, trade.id)).returning();

        await Telegram.tradeClosed({
          tradeId: trade.tradeId,
          symbol: trade.symbol,
          direction: trade.direction,
          entryPrice,
          exitPrice,
          pnl,
          pnlPercent,
          result,
          exitReason,
          holdingDurationMinutes: durationMinutes,
        });

        // Trigger learning engine
        await reviewClosedTrade(trade.id);

        logger.info({ tradeId: trade.tradeId, result, pnl }, "Trade closed");
      }
    }
  }

  private async checkTradingLimits(): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const [openCount] = await db.select({ c: count() }).from(paperTradesTable).where(eq(paperTradesTable.status, "open"));
    if (Number(openCount.c) >= MAX_OPEN_TRADES) {
      logger.info({ open: openCount.c }, "Max open trades reached");
      return false;
    }

    const [dailyCount] = await db.select({ c: count() }).from(paperTradesTable).where(gte(paperTradesTable.openedAt, today));
    if (Number(dailyCount.c) >= MAX_DAILY_TRADES) {
      logger.info({ daily: dailyCount.c }, "Max daily trades reached");
      return false;
    }

    const [weeklyCount] = await db.select({ c: count() }).from(paperTradesTable).where(gte(paperTradesTable.openedAt, weekStart));
    if (Number(weeklyCount.c) >= MAX_WEEKLY_TRADES) {
      logger.info({ weekly: weeklyCount.c }, "Max weekly trades reached");
      return false;
    }

    return true;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
