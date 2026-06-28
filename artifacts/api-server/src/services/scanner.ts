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
import { configService, type RuntimeConfig, type ScannerRuntimeConfig } from "../core/config";
import { scannerDecisionEngine } from "../core/scanner";
import { tradeService } from "../core/trading";
import { analyzeForLong, analyzeForShort, CandleData } from "./signal-engine";
import { Telegram } from "./telegram";
import { riskManager } from "./risk-manager";

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
    const { scanIntervalMs } = configService.getSync().scanner;
    const nextScanIn = this.scanStart && this.running
      ? Math.max(0, Math.round((this.scanStart + scanIntervalMs - Date.now()) / 1000))
      : null;
    return { running: this.running, lastScanAt: this.lastScanAt, nextScanIn };
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await configService.reload();
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
    const { scanIntervalMs } = configService.getSync().scanner;
    this.scanStart = Date.now();
    this.timer = setTimeout(async () => {
      if (!this.running) return;
      await this.scan();
      this.scheduleNext();
    }, scanIntervalMs);
  }

  private async scan() {
    try {
      const runtimeConfig = await configService.get();
      const config = runtimeConfig.scanner;
      logger.info("Starting market scan (v2.0)");
      const tickers = await this.fetchAllTickers(config);
      if (!tickers || tickers.length === 0) return;

      const usdtPairs = tickers.filter(t =>
        t.symbol.endsWith(config.quoteAsset) &&
        !config.excludedSymbolPrefixes.some(prefix => t.symbol.startsWith(prefix)) &&
        Number(t.quoteVolume) >= config.minVolume24h
      );

      await this.syncCoins(usdtPairs, config);

      const sorted = [...usdtPairs].sort((a, b) =>
        Number(b.priceChangePercent) - Number(a.priceChangePercent)
      );
      const gainers = sorted.slice(0, config.topListSize);
      const losers = sorted.slice(-config.topListSize).reverse();

      this.lastScanAt = new Date().toISOString();
      await this.saveSnapshots(gainers, "gainer");
      await this.saveSnapshots(losers, "loser");

      // Expire old watchlist items
      await this.expireWatchlist();

      const riskCheck = await riskManager.canTrade();

      for (const ticker of gainers.slice(0, config.analysisListSize)) {
        await this.analyzeSymbol(ticker, "LONG", riskCheck.allowed, runtimeConfig);
        await sleep(config.symbolCooldownMs);
      }

      for (const ticker of losers.slice(0, config.analysisListSize)) {
        await this.analyzeSymbol(ticker, "SHORT", riskCheck.allowed, runtimeConfig);
        await sleep(config.symbolCooldownMs);
      }

      // Re-check watchlist items
      await this.checkWatchlist(tickers, runtimeConfig);

      logger.info({ gainers: gainers.length, losers: losers.length }, "Scan v2 complete");
    } catch (err) {
      logger.error({ err }, "Scan failed");
    }
  }

  private async fetchAllTickers(config: ScannerRuntimeConfig): Promise<TickerData[]> {
    const res = await fetch(`${config.binanceBaseUrl}/fapi/v1/ticker/24hr`);
    if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
    return await res.json() as TickerData[];
  }

  private async fetchCandles(symbol: string, interval: string, limit: number, config: ScannerRuntimeConfig): Promise<CandleData[]> {
    const url = `${config.binanceBaseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = await res.json() as any[][];
    return raw.map(c => ({
      timestamp: c[0],
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }));
  }

  private async syncCoins(tickers: TickerData[], config: ScannerRuntimeConfig) {
    for (const t of tickers) {
      const baseAsset = t.symbol.replace(config.quoteAsset, "");
      await db.insert(coinsTable).values({
        symbol: t.symbol, baseAsset, quoteAsset: config.quoteAsset, isActive: true,
        lastPrice: t.lastPrice, volume24h: t.quoteVolume, priceChangePercent: t.priceChangePercent,
      }).onConflictDoUpdate({
        target: coinsTable.symbol,
        set: { lastPrice: t.lastPrice, volume24h: t.quoteVolume, priceChangePercent: t.priceChangePercent, updatedAt: new Date() },
      });
    }
  }

  private async saveSnapshots(tickers: TickerData[], listType: "gainer" | "loser") {
    const config = configService.getSync().scanner;
    for (let i = 0; i < tickers.length; i++) {
      const t = tickers[i];
      const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, t.symbol));
      if (!coin) continue;
      await db.insert(marketSnapshotsTable).values({
        coinId: coin.id, symbol: t.symbol, price: t.lastPrice,
        priceChangePercent: t.priceChangePercent, volume24h: t.quoteVolume,
        rvol: String(config.snapshotRvolFallback), rank: i + 1, listType, scannedAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  private async analyzeSymbol(ticker: TickerData, direction: "LONG" | "SHORT", canOpenTrade: boolean, runtimeConfig: RuntimeConfig) {
    const config = runtimeConfig.scanner;
    const symbol = ticker.symbol;
    const currentPrice = Number(ticker.lastPrice);
    const volume24h = Number(ticker.quoteVolume);

    try {
      // Pre-filter with quick RVOL check on 15m
      const candles15m = await this.fetchCandles(symbol, "15m", config.candles15mLimit, config);
      if (candles15m.length < config.minCandles15m) return;

      const avgVol = candles15m.slice(-config.volumeLookback - 1, -1).reduce((a, b) => a + b.volume, 0) / config.volumeLookback;
      const rvol = avgVol > 0 ? candles15m[candles15m.length - 1].volume / avgVol : 1;
      if (rvol < config.minRvol) return;

      // Fetch all timeframes for multi-TF analysis
      const [candles5m, candlesH1] = await Promise.all([
        this.fetchCandles(symbol, "5m", config.candles5mLimit, config),
        this.fetchCandles(symbol, "1h", config.candlesH1Limit, config),
      ]);

      const mtf = { m5: candles5m, h1: candlesH1, m1: [] };

      const analysis = direction === "LONG"
        ? analyzeForLong(symbol, candles15m, currentPrice, volume24h, mtf, runtimeConfig.signal)
        : analyzeForShort(symbol, candles15m, currentPrice, volume24h, mtf, runtimeConfig.signal);

      if (!analysis) return;
      const decision = await scannerDecisionEngine.decide({
        symbol,
        direction,
        candles: candles15m,
        technicalSignal: analysis,
      });
      if (!decision.accepted) {
        logger.info({ symbol, reasons: decision.reasons }, "Scanner decision rejected signal");
        return;
      }
      const decisionAnalysis: any = {
        ...analysis,
        score: decision.finalScore,
        grade: decision.signalGrade,
        reason: `${analysis.reason} | Strategy:${decision.strategy} | Market:${decision.marketRegime} | Confidence:${decision.confidence.toFixed(1)} | Final:${decision.finalScore.toFixed(1)}`,
        whyNow: `${analysis.whyNow} Market context: ${decision.marketRegime}, ${decision.context.session.session}, confidence ${decision.confidence.toFixed(1)}.`,
      };

      if (decision.finalScore >= config.minScoreTrade) {
        // A/A+ signal — try to open a trade
        const canTrade = await this.checkTradingLimits();
        if (!canTrade) {
          // Save as signal but don't open trade
          await this.saveSignal(symbol, decisionAnalysis, "active");
          return;
        }

        if (!canOpenTrade) {
          logger.info({ symbol, reason: "risk manager paused" }, "Skipping trade — risk manager paused");
          await this.saveSignal(symbol, decisionAnalysis, "active");
          return;
        }

        const newSignal = await this.saveSignal(symbol, decisionAnalysis, "active");
        await Telegram.signalCreated({
          symbol, direction: decisionAnalysis.direction, score: decisionAnalysis.score,
          grade: decisionAnalysis.grade, confidence: decisionAnalysis.confidence,
          setupType: decisionAnalysis.setupType,
          entryPrice: decisionAnalysis.entryPrice, stopLoss: decisionAnalysis.stopLoss,
          tp1: decisionAnalysis.tp1, tp2: decisionAnalysis.tp2, tp3: decisionAnalysis.tp3,
          rrRatio: decisionAnalysis.rrRatio, reason: decisionAnalysis.reason,
          whyNow: decisionAnalysis.whyNow, timeframeAlignment: decisionAnalysis.timeframeAlignment,
        });
        await this.openPaperTrade(newSignal, decisionAnalysis);

      } else if (decision.finalScore >= config.minScoreWatchlist) {
        // Near-miss — add to watchlist
        await this.addToWatchlist(symbol, decisionAnalysis);
      }

    } catch (err) {
      logger.error({ err, symbol }, "Failed to analyze symbol");
    }
  }

  private async saveSignal(symbol: string, analysis: any, status: string) {
    const expiresAt = new Date(Date.now() + configService.getSync().scanner.signalTtlMs);
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
    return await tradeService.openPaperTrade(signal, analysis);
  }

  private async addToWatchlist(symbol: string, analysis: any) {
    const existing = await db.select().from(watchlistTable)
      .where(and(eq(watchlistTable.symbol, symbol), eq(watchlistTable.isActive, true)));
    if (existing.length > 0) return;

    const expiresAt = new Date(Date.now() + configService.getSync().scanner.watchlistTtlMs);
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

  private async checkWatchlist(tickers: TickerData[], runtimeConfig: RuntimeConfig) {
    const config = runtimeConfig.scanner;
    const items = await db.select().from(watchlistTable).where(eq(watchlistTable.isActive, true));
    if (items.length === 0) return;

    const priceMap = new Map(tickers.map(t => [t.symbol, t]));

    for (const item of items) {
      const ticker = priceMap.get(item.symbol);
      if (!ticker) continue;

      try {
        const candles15m = await this.fetchCandles(item.symbol, "15m", config.candles15mLimit, config);
        if (candles15m.length < config.minCandles15m) continue;

        const [candles5m, candlesH1] = await Promise.all([
          this.fetchCandles(item.symbol, "5m", config.candles5mLimit, config),
          this.fetchCandles(item.symbol, "1h", config.candlesH1Limit, config),
        ]);

        const mtf = { m5: candles5m, h1: candlesH1, m1: [] };
        const currentPrice = Number(ticker.lastPrice);
        const volume24h = Number(ticker.quoteVolume);

        const analysis = item.direction === "LONG"
          ? analyzeForLong(item.symbol, candles15m, currentPrice, volume24h, mtf, runtimeConfig.signal)
          : analyzeForShort(item.symbol, candles15m, currentPrice, volume24h, mtf, runtimeConfig.signal);

        if (!analysis) continue;
        const decision = await scannerDecisionEngine.decide({
          symbol: item.symbol,
          direction: item.direction as "LONG" | "SHORT",
          candles: candles15m,
          technicalSignal: analysis,
        });
        if (!decision.accepted) {
          logger.info({ symbol: item.symbol, reasons: decision.reasons }, "Watchlist scanner decision rejected promotion");
          continue;
        }
        const decisionAnalysis: any = {
          ...analysis,
          score: decision.finalScore,
          grade: decision.signalGrade,
          reason: `${analysis.reason} | Strategy:${decision.strategy} | Market:${decision.marketRegime} | Confidence:${decision.confidence.toFixed(1)} | Final:${decision.finalScore.toFixed(1)}`,
          whyNow: `${analysis.whyNow} Market context: ${decision.marketRegime}, ${decision.context.session.session}, confidence ${decision.confidence.toFixed(1)}.`,
        };

        if (decision.finalScore >= config.minScoreTrade) {
          // Promoted from watchlist!
          await db.update(watchlistTable).set({ isActive: false, promoted: true }).where(eq(watchlistTable.id, item.id));
          logger.info({ symbol: item.symbol, score: decision.finalScore }, "Watchlist item promoted to signal");

          const riskCheck = await riskManager.canTrade();
          const canTrade = await this.checkTradingLimits();
          if (riskCheck.allowed && canTrade) {
            const newSignal = await this.saveSignal(item.symbol, decisionAnalysis, "active");
            await Telegram.signalCreated({
              symbol: item.symbol, direction: decisionAnalysis.direction, score: decisionAnalysis.score,
              grade: decisionAnalysis.grade, confidence: decisionAnalysis.confidence,
              setupType: decisionAnalysis.setupType, entryPrice: decisionAnalysis.entryPrice,
              stopLoss: decisionAnalysis.stopLoss, tp1: decisionAnalysis.tp1, tp2: decisionAnalysis.tp2, tp3: decisionAnalysis.tp3,
              rrRatio: decisionAnalysis.rrRatio, reason: decisionAnalysis.reason,
              whyNow: `🔼 Promoted from Watchlist! ${decisionAnalysis.whyNow}`,
              timeframeAlignment: decisionAnalysis.timeframeAlignment,
            });
            await this.openPaperTrade(newSignal, decisionAnalysis);
          }
        }
        await sleep(config.watchlistCheckCooldownMs);
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
    const config = (await configService.get()).scanner;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);

    const [openCount] = await db.select({ c: count() }).from(paperTradesTable).where(eq(paperTradesTable.status, "open"));
    if (Number(openCount.c) >= config.maxOpenTrades) { logger.info({ open: openCount.c }, "Max open trades reached"); return false; }

    const [dailyCount] = await db.select({ c: count() }).from(paperTradesTable).where(gte(paperTradesTable.openedAt, today));
    if (Number(dailyCount.c) >= config.maxDailyTrades) { logger.info({ daily: dailyCount.c }, "Max daily trades reached"); return false; }

    const [weeklyCount] = await db.select({ c: count() }).from(paperTradesTable).where(gte(paperTradesTable.openedAt, weekStart));
    if (Number(weeklyCount.c) >= config.maxWeeklyTrades) { logger.info({ weekly: weeklyCount.c }, "Max weekly trades reached"); return false; }

    return true;
  }

}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
