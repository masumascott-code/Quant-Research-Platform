import { db } from "@workspace/db";
import {
  coinsTable,
  marketSnapshotsTable,
  scannerDecisionsTable,
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

interface TradingLimitCheck {
  allowed: boolean;
  reason: string;
  details?: Record<string, unknown>;
}

export class ScannerService {
  private static instance: ScannerService;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private lastScanAt: string | null = null;
  private scanStart: number | null = null;
  private analysisCursor: Record<"LONG" | "SHORT", number> = { LONG: 0, SHORT: 0 };

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
      const blockedSymbols = await this.getBlockedAnalysisSymbols();
      const longCandidates = this.pickAnalysisCandidates(gainers, "LONG", blockedSymbols, config);
      const shortCandidates = this.pickAnalysisCandidates(losers, "SHORT", blockedSymbols, config);

      for (const ticker of longCandidates) {
        await this.analyzeSymbol(ticker, "LONG", riskCheck, runtimeConfig);
        await sleep(config.symbolCooldownMs);
      }

      for (const ticker of shortCandidates) {
        await this.analyzeSymbol(ticker, "SHORT", riskCheck, runtimeConfig);
        await sleep(config.symbolCooldownMs);
      }

      // Re-check watchlist items
      await this.checkWatchlist(tickers, runtimeConfig);

      logger.info({
        gainers: gainers.length,
        losers: losers.length,
        longAnalyzed: longCandidates.length,
        shortAnalyzed: shortCandidates.length,
        blockedSymbols: blockedSymbols.size,
      }, "Scan v2 complete");
    } catch (err) {
      logger.error({ err }, "Scan failed");
    }
  }

  private pickAnalysisCandidates(
    tickers: TickerData[],
    direction: "LONG" | "SHORT",
    blockedSymbols: Set<string>,
    config: ScannerRuntimeConfig
  ): TickerData[] {
    const pool = tickers.slice(0, Math.max(config.topListSize, config.analysisListSize));
    if (pool.length === 0) return [];

    const start = this.analysisCursor[direction] % pool.length;
    this.analysisCursor[direction] = (start + config.analysisListSize) % pool.length;

    const rotated = [...pool.slice(start), ...pool.slice(0, start)];
    const freshCandidates = rotated.filter((ticker) => !blockedSymbols.has(ticker.symbol));
    return freshCandidates.slice(0, config.analysisListSize);
  }

  private async getBlockedAnalysisSymbols(): Promise<Set<string>> {
    const [openTrades, activeSignals, activeWatchlist] = await Promise.all([
      db
        .select({ symbol: paperTradesTable.symbol })
        .from(paperTradesTable)
        .where(eq(paperTradesTable.status, "open")),
      db
        .select({ symbol: signalsTable.symbol })
        .from(signalsTable)
        .where(eq(signalsTable.status, "active")),
      db
        .select({ symbol: watchlistTable.symbol })
        .from(watchlistTable)
        .where(eq(watchlistTable.isActive, true)),
    ]);

    return new Set([
      ...openTrades.map((trade) => trade.symbol),
      ...activeSignals.map((signal) => signal.symbol),
      ...activeWatchlist.map((item) => item.symbol),
    ]);
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
    const now = Date.now();
    return raw.filter(c => Number(c[6]) <= now).map(c => ({
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
      const rvol = await this.getSnapshotRvol(t.symbol, config);
      await db.insert(marketSnapshotsTable).values({
        coinId: coin.id, symbol: t.symbol, price: t.lastPrice,
        priceChangePercent: t.priceChangePercent, volume24h: t.quoteVolume,
        rvol: rvol.toFixed(4), rank: i + 1, listType, scannedAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  private async getSnapshotRvol(symbol: string, config: ScannerRuntimeConfig): Promise<number> {
    try {
      const candles15m = await this.fetchCandles(symbol, "15m", config.candles15mLimit, config);
      return this.calculateRvol(candles15m, config.volumeLookback) ?? config.snapshotRvolFallback;
    } catch (err) {
      logger.warn({ err, symbol }, "Failed to calculate snapshot RVOL - using fallback");
      return config.snapshotRvolFallback;
    }
  }

  private calculateRvol(candles: CandleData[], lookback: number): number | null {
    if (candles.length < lookback + 1) return null;

    const currentVolume = candles[candles.length - 1]?.volume;
    const previousVolumes = candles.slice(-lookback - 1, -1);
    const averageVolume = previousVolumes.reduce((sum, candle) => sum + candle.volume, 0) / lookback;
    const rvol = averageVolume > 0 && currentVolume != null ? currentVolume / averageVolume : null;

    return rvol != null && Number.isFinite(rvol) && rvol > 0 ? rvol : null;
  }

  private async analyzeSymbol(
    ticker: TickerData,
    direction: "LONG" | "SHORT",
    riskCheck: { allowed: boolean; reason: string },
    runtimeConfig: RuntimeConfig
  ) {
    const config = runtimeConfig.scanner;
    const symbol = ticker.symbol;
    const currentPrice = Number(ticker.lastPrice);
    const volume24h = Number(ticker.quoteVolume);

    try {
      // Pre-filter with quick RVOL check on 15m
      const candles15m = await this.fetchCandles(symbol, "15m", config.candles15mLimit, config);
      if (candles15m.length < config.minCandles15m) {
        await this.saveScannerDiagnostic(symbol, direction, "Insufficient 15m candle history", "Pre-filter");
        return;
      }

      const rvol = this.calculateRvol(candles15m, config.volumeLookback) ?? 1;
      if (rvol < config.minRvol) {
        await this.saveScannerDiagnostic(symbol, direction, `RVOL below minimum (${rvol.toFixed(2)} < ${config.minRvol})`, "Pre-filter");
        return;
      }

      // Fetch all timeframes for multi-TF analysis
      const [candles5m, candlesH1] = await Promise.all([
        this.fetchCandles(symbol, "5m", config.candles5mLimit, config),
        this.fetchCandles(symbol, "1h", config.candlesH1Limit, config),
      ]);

      const mtf = { m5: candles5m, h1: candlesH1, m1: [] };

      const analysis = direction === "LONG"
        ? analyzeForLong(symbol, candles15m, currentPrice, volume24h, mtf, runtimeConfig.signal)
        : analyzeForShort(symbol, candles15m, currentPrice, volume24h, mtf, runtimeConfig.signal);

      if (!analysis) {
        await this.saveScannerDiagnostic(symbol, direction, `No qualifying ${direction} setup after technical checks`, "Technical Filter");
        return;
      }
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
        const tradeLimitCheck = await this.checkTradingLimits();
        if (!tradeLimitCheck.allowed) {
          // Save as signal but don't open trade
          const newSignal = await this.saveSignal(symbol, decisionAnalysis, "active");
          logger.warn({
            event: "signal_saved_without_trade",
            blockType: "trading_limit",
            symbol,
            direction: decisionAnalysis.direction,
            finalScore: decision.finalScore,
            reason: tradeLimitCheck.reason,
            details: tradeLimitCheck.details,
            signalId: newSignal.id,
          }, "Active signal saved without paper trade");
          return;
        }

        if (!riskCheck.allowed) {
          logger.info({ symbol, reason: "risk manager paused" }, "Skipping trade — risk manager paused");
          const newSignal = await this.saveSignal(symbol, decisionAnalysis, "active");
          logger.warn({
            event: "signal_saved_without_trade",
            blockType: "risk_manager",
            symbol,
            direction: decisionAnalysis.direction,
            finalScore: decision.finalScore,
            reason: riskCheck.reason,
            signalId: newSignal.id,
          }, "Active signal saved without paper trade");
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
    const trade = await tradeService.openPaperTrade(signal, analysis);
    if (!trade) {
      logger.warn({
        event: "paper_trade_not_opened_after_signal",
        symbol: signal.symbol,
        signalId: signal.id,
        direction: signal.direction,
        finalScore: analysis.score,
        reason: "execution_service_rejected_or_returned_null",
      }, "Paper trade was not opened after active signal");
    }
    return trade;
  }

  private async addToWatchlist(symbol: string, analysis: any) {
    const existing = await db.select().from(watchlistTable)
      .where(and(eq(watchlistTable.symbol, symbol), eq(watchlistTable.isActive, true)));

    const expiresAt = new Date(Date.now() + configService.getSync().scanner.watchlistTtlMs);
    const values = {
      symbol, direction: analysis.direction, score: String(analysis.score),
      confidence: analysis.confidence, setupType: analysis.setupType,
      entryPrice: String(analysis.entryPrice), stopLoss: String(analysis.stopLoss),
      tp1: String(analysis.tp1), tp2: String(analysis.tp2), tp3: String(analysis.tp3),
      rrRatio: String(analysis.rrRatio), reason: analysis.reason,
      isActive: true, promoted: false, expiresAt,
    };

    if (existing.length > 0) {
      await db.update(watchlistTable).set(values).where(eq(watchlistTable.id, existing[0].id));
    } else {
      await db.insert(watchlistTable).values(values);
    }

    await Telegram.watchlistAdded(symbol, analysis.direction, analysis.score, analysis.setupType);
    logger.info({ symbol, score: analysis.score, setupType: analysis.setupType }, existing.length > 0 ? "Updated watchlist" : "Added to watchlist");
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

        await db.update(watchlistTable).set({
          score: String(decision.finalScore),
          confidence: decisionAnalysis.confidence,
          setupType: decisionAnalysis.setupType,
          entryPrice: String(decisionAnalysis.entryPrice),
          stopLoss: String(decisionAnalysis.stopLoss),
          tp1: String(decisionAnalysis.tp1),
          tp2: String(decisionAnalysis.tp2),
          tp3: String(decisionAnalysis.tp3),
          rrRatio: String(decisionAnalysis.rrRatio),
          reason: decisionAnalysis.reason,
        }).where(eq(watchlistTable.id, item.id));

        if (decision.finalScore >= config.minScoreTrade) {
          // Promoted from watchlist!
          await db.update(watchlistTable).set({ isActive: false, promoted: true }).where(eq(watchlistTable.id, item.id));
          logger.info({ symbol: item.symbol, score: decision.finalScore }, "Watchlist item promoted to signal");

          const newSignal = await this.saveSignal(item.symbol, decisionAnalysis, "active");
          const riskCheck = await riskManager.canTrade();
          const tradeLimitCheck = await this.checkTradingLimits();
          if (riskCheck.allowed && tradeLimitCheck.allowed) {
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
          } else {
            const riskBlocked = !riskCheck.allowed;
            const limitBlocked = !tradeLimitCheck.allowed;
            logger.warn({
              event: "watchlist_signal_saved_without_trade",
              symbol: item.symbol,
              direction: decisionAnalysis.direction,
              finalScore: decision.finalScore,
              blockType: riskBlocked && limitBlocked
                ? "risk_manager_and_trading_limit"
                : riskBlocked
                  ? "risk_manager"
                  : "trading_limit",
              reason: riskBlocked ? riskCheck.reason : tradeLimitCheck.reason,
              details: {
                riskAllowed: riskCheck.allowed,
                riskReason: riskCheck.reason,
                tradingLimitAllowed: tradeLimitCheck.allowed,
                tradingLimitReason: tradeLimitCheck.reason,
                tradingLimitDetails: tradeLimitCheck.details,
              },
              signalId: newSignal.id,
            }, "Watchlist promotion signal saved without paper trade");
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

  private async checkTradingLimits(): Promise<TradingLimitCheck> {
    const config = (await configService.get()).scanner;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);

    const [openCount] = await db.select({ c: count() }).from(paperTradesTable).where(eq(paperTradesTable.status, "open"));
    if (Number(openCount.c) >= config.maxOpenTrades) {
      const details = { openTrades: Number(openCount.c), maxOpenTrades: config.maxOpenTrades };
      logger.info({ ...details }, "Max open trades reached");
      return { allowed: false, reason: "Max open trades reached", details };
    }

    const [dailyCount] = await db.select({ c: count() }).from(paperTradesTable).where(gte(paperTradesTable.openedAt, today));
    if (Number(dailyCount.c) >= config.maxDailyTrades) {
      const details = { dailyTrades: Number(dailyCount.c), maxDailyTrades: config.maxDailyTrades };
      logger.info({ ...details }, "Max daily trades reached");
      return { allowed: false, reason: "Max daily trades reached", details };
    }

    const [weeklyCount] = await db.select({ c: count() }).from(paperTradesTable).where(gte(paperTradesTable.openedAt, weekStart));
    if (Number(weeklyCount.c) >= config.maxWeeklyTrades) {
      const details = { weeklyTrades: Number(weeklyCount.c), maxWeeklyTrades: config.maxWeeklyTrades };
      logger.info({ ...details }, "Max weekly trades reached");
      return { allowed: false, reason: "Max weekly trades reached", details };
    }

    return { allowed: true, reason: "OK" };
  }

  private async saveScannerDiagnostic(symbol: string, direction: "LONG" | "SHORT", reason: string, strategy: string) {
    try {
      await db.insert(scannerDecisionsTable).values({
        symbol,
        direction,
        decision: "REJECTED",
        strategy,
        finalScore: "0",
        technicalScore: "0",
        confidence: "0",
        marketRegime: "UNQUALIFIED",
        opportunityRank: null,
        riskGrade: "LOW",
        reasons: [reason],
        riskSummary: [],
      });
    } catch (err) {
      logger.warn({ err, symbol }, "Failed to persist scanner diagnostic");
    }
  }

}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
