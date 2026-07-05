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
import { analyzeForLong, analyzeForShort, diagnoseTechnicalSetup, CandleData } from "./signal-engine";
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
        await this.saveScannerDiagnostic(symbol, direction, "Insufficient 15m candle history", "Pre-filter", {
          rejectionStage: "Pre-filter",
          rejectionReason: "Insufficient 15m candle history",
        });
        return;
      }

      const shortProtection = direction === "SHORT"
        ? this.buildShortProtectionDiagnostic(Number(ticker.priceChangePercent), currentPrice, candles15m)
        : undefined;
      const rvol = this.calculateRvol(candles15m, config.volumeLookback) ?? 1;
      if (rvol < config.minRvol) {
        await this.saveScannerDiagnostic(symbol, direction, `RVOL below minimum (${rvol.toFixed(2)} < ${config.minRvol})`, "Pre-filter", {
          rejectionStage: "Pre-filter",
          rejectionReason: `RVOL below minimum (${rvol.toFixed(2)} < ${config.minRvol})`,
          shortProtection,
        });
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
        const technicalDiagnostic = diagnoseTechnicalSetup(candles15m, currentPrice, volume24h, direction, mtf, runtimeConfig.signal);
        await this.saveScannerDiagnostic(symbol, direction, technicalDiagnostic.rejectionReason, "Technical Filter", {
          rejectionStage: technicalDiagnostic.rejectionStage,
          rejectionReason: technicalDiagnostic.rejectionReason,
          finalScore: 0,
          technicalScore: technicalDiagnostic.technicalScore,
          componentScores: technicalDiagnostic.componentScores,
          diagnosticDetails: {
            ...technicalDiagnostic.details,
            ema20: technicalDiagnostic.ema20,
            ema50: technicalDiagnostic.ema50,
            ema200: technicalDiagnostic.ema200,
            atr14: technicalDiagnostic.atr14,
            rvol: technicalDiagnostic.rvol,
            hasRetest: technicalDiagnostic.hasRetest,
            timeframeAlignment: technicalDiagnostic.timeframeAlignment,
          },
          shortProtection: direction === "SHORT"
            ? this.buildShortProtectionDiagnostic(Number(ticker.priceChangePercent), currentPrice, candles15m, technicalDiagnostic.hasRetest)
            : shortProtection,
        });
        return;
      }
      const decision = await scannerDecisionEngine.decide({
        symbol,
        direction,
        candles: candles15m,
        technicalSignal: analysis,
        shortProtection,
      });
      if (!decision.accepted) {
        logger.info({ symbol, reasons: decision.reasons }, "Scanner decision rejected signal");
        return;
      }
      const decisionAnalysis: any = {
        ...analysis,
        score: decision.finalScore,
        grade: decision.tradeGrade,
        reason: `${analysis.reason} | Strategy:${decision.strategy} | Market:${decision.marketRegime} | Confidence:${decision.confidence.toFixed(1)} | Final:${decision.finalScore.toFixed(1)} | ${decision.scoreDecisionReason}`,
        whyNow: `${analysis.whyNow} Market context: ${decision.marketRegime}, ${decision.context.session.session}, confidence ${decision.confidence.toFixed(1)}.`,
      };

      if (decision.scoreDecision === "TRADE_ELIGIBLE") {
        // A/A+ signal — try to open a trade
        const tradeLimitCheck = await this.checkTradingLimits();
        if (!tradeLimitCheck.allowed) {
          // Save as signal but don't open trade
          const newSignal = await this.saveOrReuseActiveSignal(symbol, decisionAnalysis);
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
          await this.saveScannerDiagnostic(symbol, direction, tradeLimitCheck.reason, "Trade Block", {
            decision: "SKIPPED",
            rejectionStage: "Trade Block",
            blockedReason: tradeLimitCheck.reason,
            finalScore: decision.finalScore,
            technicalScore: decision.scoreBreakdown.technicalScore,
            confidence: decision.confidence,
            marketRegime: decision.marketRegime,
            riskGrade: decision.context.riskGrade,
            componentScores: decision.componentScores,
            diagnosticDetails: { tradingLimitDetails: tradeLimitCheck.details },
            shortProtection: decision.shortProtection,
          });
          return;
        }

        if (!riskCheck.allowed) {
          logger.info({ symbol, reason: "risk manager paused" }, "Skipping trade — risk manager paused");
          const newSignal = await this.saveOrReuseActiveSignal(symbol, decisionAnalysis);
          logger.warn({
            event: "signal_saved_without_trade",
            blockType: "risk_manager",
            symbol,
            direction: decisionAnalysis.direction,
            finalScore: decision.finalScore,
            reason: riskCheck.reason,
            signalId: newSignal.id,
          }, "Active signal saved without paper trade");
          await this.saveScannerDiagnostic(symbol, direction, riskCheck.reason, "Trade Block", {
            decision: "SKIPPED",
            rejectionStage: "Trade Block",
            blockedReason: riskCheck.reason,
            finalScore: decision.finalScore,
            technicalScore: decision.scoreBreakdown.technicalScore,
            confidence: decision.confidence,
            marketRegime: decision.marketRegime,
            riskGrade: decision.context.riskGrade,
            componentScores: decision.componentScores,
            shortProtection: decision.shortProtection,
          });
          return;
        }

        const newSignal = await this.saveOrReuseActiveSignal(symbol, decisionAnalysis);
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

      } else if (decision.scoreDecision === "WATCHLIST") {
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

  private async saveOrReuseActiveSignal(symbol: string, analysis: any) {
    const expiresAt = new Date(Date.now() + configService.getSync().scanner.signalTtlMs);
    const values = {
      direction: analysis.direction,
      score: String(analysis.score),
      grade: analysis.grade!,
      confidence: analysis.confidence,
      setupType: analysis.setupType,
      entryPrice: String(analysis.entryPrice),
      stopLoss: String(analysis.stopLoss),
      tp1: String(analysis.tp1),
      tp2: String(analysis.tp2),
      tp3: String(analysis.tp3),
      rrRatio: String(analysis.rrRatio),
      reason: analysis.reason,
      slReason: analysis.slReason,
      whyNow: analysis.whyNow,
      whyNotEarlier: analysis.whyNotEarlier,
      whyLong: analysis.whyLong,
      whySl: analysis.whySl,
      whyTp: analysis.whyTp,
      timeframeAlignment: analysis.timeframeAlignment,
      trendScore: String(analysis.trendScore),
      emaScore: String(analysis.emaScore),
      volumeScore: String(analysis.volumeScore),
      rvolScore: String(analysis.rvolScore),
      breakoutScore: String(analysis.breakoutScore),
      retestScore: String(analysis.retestScore),
      structureScore: String(analysis.structureScore),
      momentumScore: String(analysis.momentumScore),
      expiresAt,
    };

    const [existing] = await db.select()
      .from(signalsTable)
      .where(and(
        eq(signalsTable.symbol, symbol),
        eq(signalsTable.direction, analysis.direction),
        eq(signalsTable.status, "active"),
      ))
      .orderBy(desc(signalsTable.createdAt))
      .limit(1);

    if (!existing) {
      return await this.saveSignal(symbol, analysis, "active");
    }

    const [updated] = await db.update(signalsTable)
      .set(values)
      .where(eq(signalsTable.id, existing.id))
      .returning();

    logger.info({
      symbol,
      direction: analysis.direction,
      signalId: existing.id,
      finalScore: analysis.score,
    }, "Reused active signal for trade attempt");

    return updated ?? existing;
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
        const shortProtection = item.direction === "SHORT"
          ? this.buildShortProtectionDiagnostic(Number(ticker.priceChangePercent), currentPrice, candles15m, analysis.retestScore > 0)
          : undefined;
        const decision = await scannerDecisionEngine.decide({
          symbol: item.symbol,
          direction: item.direction as "LONG" | "SHORT",
          candles: candles15m,
          technicalSignal: analysis,
          shortProtection,
        });
        if (!decision.accepted) {
          logger.info({ symbol: item.symbol, reasons: decision.reasons }, "Watchlist scanner decision rejected promotion");
          continue;
        }
        const decisionAnalysis: any = {
          ...analysis,
          score: decision.finalScore,
          grade: decision.tradeGrade,
          reason: `${analysis.reason} | Strategy:${decision.strategy} | Market:${decision.marketRegime} | Confidence:${decision.confidence.toFixed(1)} | Final:${decision.finalScore.toFixed(1)} | ${decision.scoreDecisionReason}`,
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

        if (decision.scoreDecision === "TRADE_ELIGIBLE") {
          // Promoted from watchlist!
          await db.update(watchlistTable).set({ isActive: false, promoted: true }).where(eq(watchlistTable.id, item.id));
          logger.info({ symbol: item.symbol, score: decision.finalScore }, "Watchlist item promoted to signal");

          const newSignal = await this.saveOrReuseActiveSignal(item.symbol, decisionAnalysis);
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
            await this.saveScannerDiagnostic(item.symbol, item.direction as "LONG" | "SHORT", riskBlocked ? riskCheck.reason : tradeLimitCheck.reason, "Trade Block", {
              decision: "SKIPPED",
              rejectionStage: "Trade Block",
              blockedReason: riskBlocked ? riskCheck.reason : tradeLimitCheck.reason,
              finalScore: decision.finalScore,
              technicalScore: decision.scoreBreakdown.technicalScore,
              confidence: decision.confidence,
              marketRegime: decision.marketRegime,
              riskGrade: decision.context.riskGrade,
              componentScores: decision.componentScores,
              diagnosticDetails: {
                riskAllowed: riskCheck.allowed,
                riskReason: riskCheck.reason,
                tradingLimitAllowed: tradeLimitCheck.allowed,
                tradingLimitReason: tradeLimitCheck.reason,
                tradingLimitDetails: tradeLimitCheck.details,
              },
              shortProtection: decision.shortProtection,
            });
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

  private buildShortProtectionDiagnostic(
    priceChangePercent: number,
    currentPrice: number,
    candles15m: CandleData[],
    hasBearishRetestOverride?: boolean,
  ) {
    const config = configService.getSync().shortProtection;
    const closes = candles15m.map((candle) => candle.close);
    const ema20 = latestEma(closes, configService.getSync().signal.emaFastPeriod);
    const ema50 = latestEma(closes, configService.getSync().signal.emaSlowPeriod);
    const distanceFromEMA20 = ema20 > 0 ? (currentPrice - ema20) / ema20 : null;
    const distanceFromEMA50 = ema50 > 0 ? (currentPrice - ema50) / ema50 : null;
    const hasBearishRetest = hasBearishRetestOverride ?? hasRecentBearishRetest(candles15m, ema20);
    const isShortOverextended = Boolean(
      distanceFromEMA20 != null
      && distanceFromEMA50 != null
      && (
        distanceFromEMA20 <= -Math.abs(config.maxShortExtensionFromEMA20)
        || distanceFromEMA50 <= -Math.abs(config.maxShortExtensionFromEMA50)
      )
    );
    const reasons: string[] = [];

    if (config.requireShortRetest && !hasBearishRetest) {
      reasons.push("No bearish retest after breakdown");
    }
    if (distanceFromEMA20 != null && distanceFromEMA20 <= -Math.abs(config.maxShortExtensionFromEMA20)) {
      reasons.push(`Price is too far below EMA20 (${(distanceFromEMA20 * 100).toFixed(2)}%)`);
    }
    if (distanceFromEMA50 != null && distanceFromEMA50 <= -Math.abs(config.maxShortExtensionFromEMA50)) {
      reasons.push(`Price is too far below EMA50 (${(distanceFromEMA50 * 100).toFixed(2)}%)`);
    }
    if (Number.isFinite(priceChangePercent) && priceChangePercent <= config.maxNegative24hMoveForFreshShort) {
      reasons.push(`24h move is already heavily negative (${priceChangePercent.toFixed(2)}%)`);
    }

    return {
      priceChangePercent: Number.isFinite(priceChangePercent) ? priceChangePercent : null,
      distanceFromEMA20,
      distanceFromEMA50,
      isShortOverextended,
      hasBearishRetest,
      marketRegime: null,
      btcTrendBias: null,
      shortProtectionWouldBlock: config.enabled && reasons.length > 0,
      shortProtectionReasons: reasons,
      diagnosticOnly: config.diagnosticOnly,
    };
  }

  private async saveScannerDiagnostic(
    symbol: string,
    direction: "LONG" | "SHORT",
    reason: string,
    strategy: string,
    options: {
      decision?: "REJECTED" | "SKIPPED" | "ACCEPTED" | "WATCHLIST";
      rejectionStage?: string | null;
      rejectionReason?: string | null;
      blockedReason?: string | null;
      tradeGrade?: string | null;
      scoreDecision?: string | null;
      scoreDecisionReason?: string | null;
      finalScore?: number;
      technicalScore?: number;
      confidence?: number;
      marketRegime?: string;
      riskGrade?: string;
      componentScores?: unknown;
      diagnosticDetails?: Record<string, unknown> | null;
      shortProtection?: unknown;
    } = {},
  ) {
    try {
      await db.insert(scannerDecisionsTable).values({
        symbol,
        direction,
        decision: options.decision ?? "REJECTED",
        strategy,
        componentScores: options.componentScores,
        diagnosticDetails: {
          scannerMode: configService.getSync().scanner.mode,
          tradeGrade: options.tradeGrade ?? gradeFromScore(options.finalScore ?? 0),
          scoreDecision: options.scoreDecision ?? (options.decision === "ACCEPTED" ? "TRADE_ELIGIBLE" : options.decision ?? "REJECTED"),
          scoreDecisionReason: options.scoreDecisionReason ?? options.rejectionReason ?? reason,
          ...(options.diagnosticDetails ?? {}),
          shortProtection: options.shortProtection ?? null,
        },
        rejectionStage: options.rejectionStage ?? strategy,
        rejectionReason: options.rejectionReason ?? reason,
        blockedReason: options.blockedReason ?? null,
        finalScore: String(options.finalScore ?? 0),
        technicalScore: String(options.technicalScore ?? 0),
        confidence: String(options.confidence ?? 0),
        marketRegime: options.marketRegime ?? "UNQUALIFIED",
        opportunityRank: null,
        riskGrade: options.riskGrade ?? "LOW",
        reasons: [reason],
        riskSummary: [],
      });
    } catch (err) {
      logger.warn({ err, symbol }, "Failed to persist scanner diagnostic");
    }
  }

}

function latestEma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, Math.min(period, values.length)).reduce((sum, value) => sum + value, 0) / Math.min(period, values.length);
  for (const value of values.slice(period)) {
    ema = value * k + ema * (1 - k);
  }
  return ema;
}

function hasRecentBearishRetest(candles: CandleData[], ema20: number): boolean {
  if (candles.length < 3 || ema20 <= 0) return false;
  const recent = candles.slice(-6);
  return recent.some((candle, index) => {
    const next = recent[index + 1];
    if (!next) return false;
    const testedEma = Math.abs(candle.high - ema20) / ema20 <= 0.006 || Math.abs(candle.close - ema20) / ema20 <= 0.006;
    const rejected = next.close < candle.close && next.close < ema20;
    return testedEma && rejected;
  });
}

function gradeFromScore(score: number): "A+" | "A" | "B" | "C" {
  if (configService.getSync().scanner.mode === "conservative_v2") {
    if (score >= 90) return "A+";
    if (score >= 85) return "A";
    if (score >= 80) return "B";
    return "C";
  }

  if (score >= configService.getSync().scannerDecision.gradeAPlusThreshold) return "A+";
  if (score >= configService.getSync().scannerDecision.gradeAThreshold) return "A";
  if (score >= configService.getSync().scannerDecision.gradeBThreshold) return "B";
  return "C";
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
