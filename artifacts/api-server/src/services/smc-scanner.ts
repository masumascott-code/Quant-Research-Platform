import { db } from "@workspace/db";
import {
  coinsTable,
  paperTradesTable,
  scannerDecisionsTable,
  signalsTable,
} from "@workspace/db";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { configService, type RuntimeConfig } from "../core/config";
import { tradeService } from "../core/trading";
import { logger } from "../lib/logger";
import { riskManager } from "./risk-manager";
import { analyzeSmcSetup, toSmcDiagnostic } from "./smc-signal-engine";
import type { SmcCandle, SmcDiagnostic, SmcSignalAnalysis, TradeDirection } from "../core/smc";

interface TickerData {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
}

interface Candidate {
  ticker: TickerData;
  score: number;
  reason: string;
}

interface TradingLimitCheck {
  allowed: boolean;
  reason: string;
  details?: Record<string, unknown>;
}

export class SmcScannerService {
  private static instance: SmcScannerService;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private lastScanAt: string | null = null;
  private scanStart: number | null = null;
  private readonly symbolCooldowns = new Map<string, number>();

  static getInstance(): SmcScannerService {
    if (!SmcScannerService.instance) {
      SmcScannerService.instance = new SmcScannerService();
    }
    return SmcScannerService.instance;
  }

  getStatus() {
    const config = configService.getSync().smcScanner;
    const nextScanIn = this.scanStart && this.running
      ? Math.max(0, Math.round((this.scanStart + config.scanIntervalMs - Date.now()) / 1000))
      : null;
    return {
      running: this.running,
      enabled: config.enabled,
      shadowMode: config.shadowMode,
      paperTradingEnabled: config.paperTradingEnabled,
      lastScanAt: this.lastScanAt,
      nextScanIn,
    };
  }

  async start() {
    await configService.reload();
    const config = configService.getSync().smcScanner;
    if (!config.enabled) {
      logger.info("SMC scanner not started because smcScanner.enabled=false");
      return;
    }
    if (this.running) return;
    this.running = true;
    logger.info("SMC scanner started");
    await this.scan();
    this.scheduleNext();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info("SMC scanner stopped");
  }

  async scanOnceForTest(runtimeConfig?: RuntimeConfig) {
    await this.scan(runtimeConfig ?? await configService.get());
  }

  private scheduleNext() {
    if (!this.running) return;
    const { scanIntervalMs } = configService.getSync().smcScanner;
    this.scanStart = Date.now();
    this.timer = setTimeout(async () => {
      if (!this.running) return;
      await this.scan();
      this.scheduleNext();
    }, scanIntervalMs);
  }

  private async scan(runtimeConfig?: RuntimeConfig) {
    const config = runtimeConfig ?? await configService.get();
    if (!config.smcScanner.enabled) {
      logger.debug("SMC scan skipped because scanner is disabled");
      return;
    }

    try {
      logger.info("Starting SMC market scan");
      const tickers = await this.fetchAllTickers(config);
      const universe = tickers.filter((ticker) =>
        ticker.symbol.endsWith(config.scanner.quoteAsset)
        && !config.scanner.excludedSymbolPrefixes.some((prefix) => ticker.symbol.startsWith(prefix))
        && Number(ticker.quoteVolume) >= config.smcScanner.minQuoteVolume
      );
      await this.syncCoins(universe, config);

      const candidates = await this.selectCandidates(universe, config);
      this.lastScanAt = new Date().toISOString();

      for (const candidate of candidates) {
        await this.analyzeSymbol(candidate.ticker, "LONG", config, candidate.reason);
        await sleep(Math.min(config.smcScanner.symbolCooldownMs, 1_000));
        await this.analyzeSymbol(candidate.ticker, "SHORT", config, candidate.reason);
        await sleep(Math.min(config.smcScanner.symbolCooldownMs, 1_000));
      }

      logger.info({ candidates: candidates.length }, "SMC scan complete");
    } catch (err) {
      logger.error({ err }, "SMC scan failed");
    }
  }

  private async selectCandidates(tickers: TickerData[], config: RuntimeConfig): Promise<Candidate[]> {
    const liquid = [...tickers]
      .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
      .slice(0, Math.max(config.smcScanner.maxCandidates * 3, config.smcScanner.maxCandidates));
    const candidates: Candidate[] = [];

    for (const ticker of liquid) {
      const candles = await this.fetchCandles(ticker.symbol, "15m", Math.min(80, config.smcScanner.candles15mLimit), config);
      if (candles.length < 30) continue;
      const score = this.scoreCandidate(Number(ticker.lastPrice), candles);
      if (score > 0) {
        candidates.push({ ticker, score, reason: this.candidateReason(score, candles) });
      }
      if (candidates.length >= config.smcScanner.maxCandidates * 2) break;
    }

    return candidates
      .sort((a, b) => b.score - a.score || Number(b.ticker.quoteVolume) - Number(a.ticker.quoteVolume))
      .slice(0, config.smcScanner.maxCandidates);
  }

  private scoreCandidate(price: number, candles: SmcCandle[]): number {
    const recent = candles.slice(-32);
    const high = Math.max(...recent.map((candle) => candle.high));
    const low = Math.min(...recent.map((candle) => candle.low));
    const range = high - low;
    if (!Number.isFinite(price) || price <= 0 || range <= 0) return 0;

    const nearHighLow = Math.min(Math.abs(high - price), Math.abs(price - low)) / price;
    const compression = range / price;
    let score = 0;
    if (nearHighLow <= 0.01) score += 40;
    if (compression <= 0.045) score += 25;
    if (hasEqualHighOrLow(recent)) score += 25;
    if (hasClearSwingStructure(recent)) score += 10;
    return score;
  }

  private candidateReason(score: number, candles: SmcCandle[]): string {
    const recent = candles.slice(-32);
    const high = Math.max(...recent.map((candle) => candle.high));
    const low = Math.min(...recent.map((candle) => candle.low));
    return `Liquid SMC candidate score ${score}; recent range ${low.toFixed(8)}-${high.toFixed(8)}`;
  }

  private async analyzeSymbol(
    ticker: TickerData,
    direction: TradeDirection,
    runtimeConfig: RuntimeConfig,
    candidateReason: string,
  ) {
    const symbol = ticker.symbol;
    try {
      if (this.isSymbolCoolingDown(symbol, direction, runtimeConfig)) {
        await this.saveDiagnostic({
          symbol,
          direction,
          decision: "SKIPPED",
          source: "SMC",
          reason: `SMC symbol cooldown active (${runtimeConfig.smcScanner.symbolCooldownMinutes}m)`,
          strategyLabel: "SMC",
          htfBias: "neutral",
          liquiditySweep: "Not evaluated",
          structure: "Not evaluated",
          fvg: "Not evaluated",
          orderBlock: "Not evaluated",
          premiumDiscount: "Not evaluated",
          fibonacci: runtimeConfig.smcScanner.useFibonacciConfluence ? "Not evaluated" : "Not enabled",
          riskReward: "Not evaluated",
          smcScore: 0,
          paperTradeOpened: false,
          paperTradeId: null,
          paperTradeBlockedReason: "SMC symbol cooldown active",
          details: { candidateReason, symbolCooldownMinutes: runtimeConfig.smcScanner.symbolCooldownMinutes },
        });
        return;
      }

      const [candles5m, candles15m, candles1h, candles4h] = await Promise.all([
        this.fetchCandles(symbol, "5m", runtimeConfig.smcScanner.candles5mLimit, runtimeConfig),
        this.fetchCandles(symbol, "15m", runtimeConfig.smcScanner.candles15mLimit, runtimeConfig),
        this.fetchCandles(symbol, "1h", runtimeConfig.smcScanner.candlesH1Limit, runtimeConfig),
        this.fetchCandles(symbol, "4h", runtimeConfig.smcScanner.candlesH4Limit, runtimeConfig),
      ]);

      if (candles5m.length < 40 || candles15m.length < 40 || candles1h.length < 20) {
        await this.saveDiagnostic({
          symbol,
          direction,
          decision: "REJECTED",
          source: "SMC",
          reason: "Insufficient multi-timeframe candle history",
          htfBias: "neutral",
          liquiditySweep: "Not evaluated",
          structure: "Not evaluated",
          fvg: "Not evaluated",
          orderBlock: "Not evaluated",
          premiumDiscount: "Not evaluated",
          fibonacci: runtimeConfig.smcScanner.useFibonacciConfluence ? "Not evaluated" : "Not enabled",
          riskReward: "Not evaluated",
          smcScore: 0,
          paperTradeOpened: false,
          paperTradeId: null,
          paperTradeBlockedReason: "Insufficient multi-timeframe candle history",
          details: { candidateReason },
        });
        return;
      }

      const analysis = analyzeSmcSetup({
        symbol,
        direction,
        currentPrice: Number(ticker.lastPrice),
        volume24h: Number(ticker.quoteVolume),
        candles5m,
        candles15m,
        candles1h,
        candles4h,
        config: runtimeConfig.smcScanner,
      });
      const diagnostic = toSmcDiagnostic(analysis);

      if (analysis.decision === "REJECTED") {
        await this.saveDiagnostic(diagnostic);
        this.markSymbolCooldown(symbol, direction, runtimeConfig);
        return;
      }

      if (await this.hasDuplicateActiveSmcSignal(symbol, direction)) {
        await this.saveDiagnostic({
          ...diagnostic,
          decision: "SKIPPED",
          reason: "Duplicate active SMC signal",
          paperTradeBlockedReason: "Duplicate active SMC signal",
        });
        this.markSymbolCooldown(symbol, direction, runtimeConfig);
        return;
      }

      if (analysis.decision === "WATCHLIST") {
        await this.saveDiagnostic(diagnostic);
        this.markSymbolCooldown(symbol, direction, runtimeConfig);
        return;
      }

      if (runtimeConfig.smcScanner.shadowMode) {
        await this.saveDiagnostic({
          ...diagnostic,
          decision: "SKIPPED",
          reason: "SMC shadow mode enabled",
          paperTradeBlockedReason: "SMC shadow mode enabled",
        });
        this.markSymbolCooldown(symbol, direction, runtimeConfig);
        return;
      }

      const signal = await this.saveSignal(symbol, analysis, "active");

      if (!runtimeConfig.smcScanner.paperTradingEnabled) {
        await this.saveDiagnostic({
          ...diagnostic,
          decision: "SKIPPED",
          reason: "SMC paper trading disabled",
          paperTradeBlockedReason: "SMC paper trading disabled",
        });
        this.markSymbolCooldown(symbol, direction, runtimeConfig);
        return;
      }

      await this.tryOpenPaperTrade(signal, analysis, diagnostic, runtimeConfig);
      this.markSymbolCooldown(symbol, direction, runtimeConfig);
    } catch (err) {
      logger.error({ err, symbol, direction }, "SMC analysis failed");
      await this.saveDiagnostic({
        symbol,
        direction,
        decision: "REJECTED",
        source: "SMC",
        reason: "SMC analysis error",
        htfBias: "neutral",
        liquiditySweep: "Error",
        structure: "Error",
        fvg: "Error",
        orderBlock: "Error",
        premiumDiscount: "Error",
        fibonacci: "Error",
        riskReward: "Error",
        smcScore: 0,
        paperTradeOpened: false,
        paperTradeId: null,
        paperTradeBlockedReason: "SMC analysis error",
        details: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  private async tryOpenPaperTrade(
    signal: typeof signalsTable.$inferSelect,
    analysis: SmcSignalAnalysis,
    diagnostic: SmcDiagnostic,
    runtimeConfig: RuntimeConfig,
  ) {
    const duplicateOpenPosition = await this.hasOpenPosition(signal.symbol, signal.direction);
    if (duplicateOpenPosition) {
      await this.saveDiagnostic({
        ...diagnostic,
        decision: "SKIPPED",
        reason: "Duplicate open paper position for same symbol/direction",
        paperTradeBlockedReason: "Duplicate open paper position for same symbol/direction",
      });
      return;
    }

    const riskCheck = await riskManager.canTrade();
    if (!riskCheck.allowed) {
      await this.saveDiagnostic({
        ...diagnostic,
        decision: "SKIPPED",
        reason: riskCheck.reason,
        paperTradeBlockedReason: riskCheck.reason,
      });
      return;
    }

    const tradeLimitCheck = await this.checkTradingLimits(runtimeConfig);
    if (!tradeLimitCheck.allowed) {
      await this.saveDiagnostic({
        ...diagnostic,
        decision: "SKIPPED",
        reason: tradeLimitCheck.reason,
        paperTradeBlockedReason: tradeLimitCheck.reason,
        details: { ...diagnostic.details, tradingLimitDetails: tradeLimitCheck.details },
      });
      return;
    }

    const trade = await tradeService.openPaperTrade(signal, {
      setupType: analysis.setupType,
      confidence: analysis.confidence,
      entryPrice: analysis.entryPrice,
      stopLoss: analysis.stopLoss,
      tp1: analysis.tp1,
      tp2: analysis.tp2,
      tp3: analysis.tp3,
      score: analysis.score,
      grade: analysis.grade ?? undefined,
      reason: analysis.reason,
      slReason: analysis.slReason,
      rrRatio: analysis.rrRatio,
      source: "SMC",
      scannerType: "SMC_SCANNER",
      strategyType: "SMC",
      strategyLabel: analysis.strategyLabel,
      badge: "SMC",
      smcScore: analysis.score,
      smcDetails: analysis.details,
    });

    if (!trade) {
      await this.saveDiagnostic({
        ...diagnostic,
        decision: "SKIPPED",
        reason: "Trade rejected by paper execution service",
        paperTradeBlockedReason: "Trade rejected by paper execution service",
      });
      return;
    }

    await this.saveDiagnostic({
      ...diagnostic,
      paperTradeOpened: true,
      paperTradeId: trade.tradeId,
      paperTradeBlockedReason: null,
      details: { ...diagnostic.details, paperTradeId: trade.tradeId },
    });
  }

  private async fetchAllTickers(config: RuntimeConfig): Promise<TickerData[]> {
    const res = await fetch(`${config.scanner.binanceBaseUrl}/fapi/v1/ticker/24hr`);
    if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
    return await res.json() as TickerData[];
  }

  private async fetchCandles(symbol: string, interval: string, limit: number, config: RuntimeConfig): Promise<SmcCandle[]> {
    const url = `${config.scanner.binanceBaseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = await res.json() as any[][];
    const now = Date.now();
    return raw.filter((candle) => Number(candle[6]) <= now).map((candle) => ({
      timestamp: Number(candle[0]),
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5]),
    }));
  }

  private async syncCoins(tickers: TickerData[], config: RuntimeConfig) {
    for (const ticker of tickers) {
      const baseAsset = ticker.symbol.replace(config.scanner.quoteAsset, "");
      await db.insert(coinsTable).values({
        symbol: ticker.symbol,
        baseAsset,
        quoteAsset: config.scanner.quoteAsset,
        isActive: true,
        lastPrice: ticker.lastPrice,
        volume24h: ticker.quoteVolume,
        priceChangePercent: ticker.priceChangePercent,
      }).onConflictDoUpdate({
        target: coinsTable.symbol,
        set: {
          lastPrice: ticker.lastPrice,
          volume24h: ticker.quoteVolume,
          priceChangePercent: ticker.priceChangePercent,
          updatedAt: new Date(),
        },
      });
    }
  }

  private async saveSignal(symbol: string, analysis: SmcSignalAnalysis, status: string) {
    const expiresAt = new Date(Date.now() + configService.getSync().scanner.signalTtlMs);
    const [signal] = await db.insert(signalsTable).values({
      symbol,
      direction: analysis.direction,
      source: "SMC",
      scannerType: "SMC_SCANNER",
      strategyType: "SMC",
      strategyLabel: analysis.strategyLabel,
      badge: "SMC",
      smcScore: String(analysis.score),
      smcDetails: analysis.details,
      score: String(analysis.score),
      grade: analysis.grade ?? "B",
      confidence: analysis.confidence,
      setupType: analysis.setupType,
      entryPrice: String(analysis.entryPrice),
      stopLoss: String(analysis.stopLoss),
      tp1: String(analysis.tp1),
      tp2: String(analysis.tp2),
      tp3: String(analysis.tp3),
      rrRatio: String(analysis.rrRatio),
      status,
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
    }).returning();
    return signal;
  }

  private async saveDiagnostic(diagnostic: SmcDiagnostic) {
    try {
      await db.insert(scannerDecisionsTable).values({
        symbol: diagnostic.symbol,
        direction: diagnostic.direction,
        source: "SMC",
        scannerType: "SMC_SCANNER",
        strategyType: "SMC",
        strategyLabel: typeof diagnostic.details.strategyLabel === "string" ? diagnostic.details.strategyLabel : "SMC",
        badge: "SMC",
        smcScore: String(diagnostic.smcScore),
        smcDetails: {
          ...diagnostic.details,
          paperTradeOpened: diagnostic.paperTradeOpened,
          paperTradeId: diagnostic.paperTradeId ?? null,
          paperTradeBlockedReason: diagnostic.paperTradeBlockedReason ?? null,
          htfBias: diagnostic.htfBias,
          liquiditySweep: diagnostic.liquiditySweep,
          structure: diagnostic.structure,
          fvg: diagnostic.fvg,
          orderBlock: diagnostic.orderBlock,
          premiumDiscount: diagnostic.premiumDiscount,
          fibonacci: diagnostic.fibonacci,
          riskReward: diagnostic.riskReward,
        },
        componentScores: extractSmcComponentScores(diagnostic.details),
        diagnosticDetails: {
          source: "SMC",
          scannerType: "SMC_SCANNER",
          decision: diagnostic.decision,
          smcScore: diagnostic.smcScore,
          htfBias: diagnostic.htfBias,
          liquiditySweep: diagnostic.liquiditySweep,
          structure: diagnostic.structure,
          fvg: diagnostic.fvg,
          orderBlock: diagnostic.orderBlock,
          premiumDiscount: diagnostic.premiumDiscount,
          fibonacci: diagnostic.fibonacci,
          riskReward: diagnostic.riskReward,
          paperTradeOpened: diagnostic.paperTradeOpened,
          paperTradeId: diagnostic.paperTradeId ?? null,
          paperTradeBlockedReason: diagnostic.paperTradeBlockedReason ?? null,
          details: diagnostic.details,
        },
        rejectionStage: diagnostic.decision === "ACCEPTED" ? null : "SMC",
        rejectionReason: diagnostic.decision === "ACCEPTED" ? null : diagnostic.reason,
        blockedReason: diagnostic.paperTradeBlockedReason ?? null,
        decision: diagnostic.decision === "WATCHLIST" ? "WATCHLIST" : diagnostic.decision,
        strategy: "SMC",
        finalScore: String(diagnostic.smcScore),
        technicalScore: String(diagnostic.smcScore),
        confidence: String(diagnostic.smcScore),
        marketRegime: `HTF_${diagnostic.htfBias.toUpperCase()}`,
        opportunityRank: null,
        riskGrade: diagnostic.riskReward.includes("No valid") ? "HIGH" : "LOW",
        reasons: [diagnostic.reason],
        riskSummary: [
          diagnostic.riskReward,
          `HTF: ${diagnostic.htfBias}`,
          `Sweep: ${diagnostic.liquiditySweep}`,
          `Structure: ${diagnostic.structure}`,
          `FVG: ${diagnostic.fvg}`,
          `OB: ${diagnostic.orderBlock}`,
          `Fib/PD: ${diagnostic.fibonacci}; ${diagnostic.premiumDiscount}`,
        ],
      });
    } catch (err) {
      logger.warn({ err, symbol: diagnostic.symbol }, "Failed to persist SMC diagnostic");
    }
  }

  private async hasDuplicateActiveSmcSignal(symbol: string, direction: TradeDirection): Promise<boolean> {
    const [existing] = await db.select({ id: signalsTable.id })
      .from(signalsTable)
      .where(and(
        eq(signalsTable.symbol, symbol),
        eq(signalsTable.direction, direction),
        eq(signalsTable.status, "active"),
        eq(signalsTable.scannerType, "SMC_SCANNER"),
      ))
      .orderBy(desc(signalsTable.createdAt))
      .limit(1);
    return existing != null;
  }

  private async hasOpenPosition(symbol: string, direction: string): Promise<boolean> {
    const [existing] = await db.select({ id: paperTradesTable.id })
      .from(paperTradesTable)
      .where(and(
        eq(paperTradesTable.symbol, symbol),
        eq(paperTradesTable.direction, direction),
        eq(paperTradesTable.status, "open"),
      ))
      .limit(1);
    return existing != null;
  }

  private async checkTradingLimits(runtimeConfig: RuntimeConfig): Promise<TradingLimitCheck> {
    const config = runtimeConfig.smcScanner;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [openCount] = await db.select({ c: count() }).from(paperTradesTable).where(and(
      eq(paperTradesTable.status, "open"),
      eq(paperTradesTable.source, "SMC"),
    ));
    if (Number(openCount.c) >= config.maxOpenTrades) {
      return { allowed: false, reason: "Max open trades reached", details: { openTrades: Number(openCount.c), maxOpenTrades: config.maxOpenTrades } };
    }

    const [dailyCount] = await db.select({ c: count() }).from(paperTradesTable).where(and(
      eq(paperTradesTable.source, "SMC"),
      gte(paperTradesTable.openedAt, today),
    ));
    if (Number(dailyCount.c) >= config.maxDailyTrades) {
      return { allowed: false, reason: "Max daily trades reached", details: { dailyTrades: Number(dailyCount.c), maxDailyTrades: config.maxDailyTrades } };
    }

    return { allowed: true, reason: "OK" };
  }

  private isSymbolCoolingDown(symbol: string, direction: TradeDirection, runtimeConfig: RuntimeConfig): boolean {
    const cooldownMs = runtimeConfig.smcScanner.symbolCooldownMinutes * 60_000;
    if (cooldownMs <= 0) return false;
    const key = `${symbol}:${direction}`;
    const lastAnalyzedAt = this.symbolCooldowns.get(key);
    return lastAnalyzedAt != null && Date.now() - lastAnalyzedAt < cooldownMs;
  }

  private markSymbolCooldown(symbol: string, direction: TradeDirection, runtimeConfig: RuntimeConfig) {
    if (runtimeConfig.smcScanner.symbolCooldownMinutes <= 0) return;
    this.symbolCooldowns.set(`${symbol}:${direction}`, Date.now());
  }
}

export function isDuplicateSmcSignal(existing: Array<{ symbol: string; direction: string; scannerType?: string | null; status: string }>, symbol: string, direction: TradeDirection): boolean {
  return existing.some((signal) =>
    signal.symbol === symbol
    && signal.direction === direction
    && signal.status === "active"
    && signal.scannerType === "SMC_SCANNER"
  );
}

function hasEqualHighOrLow(candles: SmcCandle[]): boolean {
  const tolerance = 0.002;
  for (let i = 0; i < candles.length; i++) {
    for (let j = i + 1; j < candles.length; j++) {
      if (Math.abs(candles[i].high - candles[j].high) / candles[i].high <= tolerance) return true;
      if (Math.abs(candles[i].low - candles[j].low) / candles[i].low <= tolerance) return true;
    }
  }
  return false;
}

function hasClearSwingStructure(candles: SmcCandle[]): boolean {
  if (candles.length < 8) return false;
  const closes = candles.slice(-8).map((candle) => candle.close);
  const rising = closes.filter((close, index) => index > 0 && close > closes[index - 1]).length;
  const falling = closes.filter((close, index) => index > 0 && close < closes[index - 1]).length;
  return rising >= 5 || falling >= 5;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractSmcComponentScores(details: Record<string, unknown>) {
  const scoreBreakdown = details.scoreBreakdown;
  return scoreBreakdown && typeof scoreBreakdown === "object" ? scoreBreakdown : null;
}

export const smcScannerService = SmcScannerService.getInstance();
