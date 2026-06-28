import {
  db,
  backtestsTable,
  backtestTradesTable,
  experimentsTable,
  parameterSetsTable,
  performanceMetricsTable,
  strategyVersionsTable,
  walkForwardResultsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import type { BacktestResult, ParameterCandidate, PerformanceMetrics, ResearchTrade, WalkForwardSummary } from "./types";

export class ResearchRepository {
  async createBacktest(params: {
    runId: string;
    strategyVersionId?: number;
    parameterSetId?: number;
    symbol: string;
    exchange: string;
    timeframe: string;
    startAt: Date;
    endAt: Date;
    initialEquity: number;
    marketRegime?: string;
    notes?: string;
    config?: Record<string, unknown>;
  }): Promise<number> {
    const [row] = await db.insert(backtestsTable).values({
      runId: params.runId,
      strategyVersionId: params.strategyVersionId,
      parameterSetId: params.parameterSetId,
      symbol: params.symbol,
      exchange: params.exchange,
      timeframe: params.timeframe,
      startAt: params.startAt,
      endAt: params.endAt,
      initialEquity: String(params.initialEquity),
      marketRegime: params.marketRegime,
      notes: params.notes,
      config: params.config,
      status: "RUNNING",
    }).returning({ id: backtestsTable.id });
    if (!row) throw new Error("Failed to create backtest");
    return row.id;
  }

  async completeBacktest(backtestId: number, result: BacktestResult): Promise<void> {
    const finalEquity = result.metrics.equityCurve.at(-1)?.equity ?? 0;
    await db.update(backtestsTable).set({
      status: result.status,
      finalEquity: String(finalEquity),
      completedAt: result.completedAt,
    }).where(eq(backtestsTable.id, backtestId));
    await this.recordTrades(backtestId, result.trades);
    await this.recordMetrics({ backtestId, metrics: result.metrics, scope: "BACKTEST" });
  }

  async failBacktest(backtestId: number): Promise<void> {
    await db.update(backtestsTable).set({ status: "FAILED", completedAt: new Date() }).where(eq(backtestsTable.id, backtestId));
  }

  async recordTrades(backtestId: number, trades: ResearchTrade[]): Promise<void> {
    if (trades.length === 0) return;
    await db.insert(backtestTradesTable).values(trades.map((trade) => ({
      backtestId,
      paperTradeId: trade.sourceTradeId,
      symbol: trade.symbol,
      direction: trade.direction,
      entryAt: trade.entryAt,
      exitAt: trade.exitAt,
      entryPrice: String(trade.entryPrice),
      exitPrice: trade.exitPrice == null ? null : String(trade.exitPrice),
      quantity: String(trade.quantity),
      pnl: String(trade.pnl),
      pnlPercent: String(trade.pnlPercent),
      rMultiple: String(trade.rMultiple),
      fees: String(trade.fees),
      metadata: { riskAmount: trade.riskAmount, holdMinutes: trade.holdMinutes },
    })));
  }

  async recordMetrics(params: { backtestId?: number; experimentId?: number; metrics: PerformanceMetrics; scope: string }): Promise<void> {
    await db.insert(performanceMetricsTable).values({
      backtestId: params.backtestId,
      experimentId: params.experimentId,
      scope: params.scope,
      winRate: this.numericMetric(params.metrics.winRate),
      profitFactor: this.numericMetric(params.metrics.profitFactor),
      expectancy: this.numericMetric(params.metrics.expectancy),
      sharpeRatio: this.numericMetric(params.metrics.sharpeRatio),
      sortinoRatio: this.numericMetric(params.metrics.sortinoRatio),
      calmarRatio: this.numericMetric(params.metrics.calmarRatio),
      maxDrawdown: this.numericMetric(params.metrics.maxDrawdown),
      averageHoldMinutes: this.numericMetric(params.metrics.averageHoldMinutes),
      averageRMultiple: this.numericMetric(params.metrics.averageRMultiple),
      averageRisk: this.numericMetric(params.metrics.averageRisk),
      totalReturn: this.numericMetric(params.metrics.totalReturn),
      tradeCount: params.metrics.tradeCount,
      equityCurve: params.metrics.equityCurve,
    });
  }

  async createStrategyVersion(params: {
    strategyId: string;
    version: string;
    name: string;
    description?: string;
    sourceHash?: string;
    metadata?: Record<string, unknown>;
  }): Promise<number> {
    const [row] = await db.insert(strategyVersionsTable).values(params).returning({ id: strategyVersionsTable.id });
    if (!row) throw new Error("Failed to create strategy version");
    return row.id;
  }

  async createParameterSet(params: ParameterCandidate & { strategyVersionId?: number; optimizer?: string; notes?: string }): Promise<number> {
    const [row] = await db.insert(parameterSetsTable).values({
      strategyVersionId: params.strategyVersionId,
      name: params.name,
      parameters: params.parameters,
      optimizer: params.optimizer,
      notes: params.notes,
    }).returning({ id: parameterSetsTable.id });
    if (!row) throw new Error("Failed to create parameter set");
    return row.id;
  }

  async createExperiment(params: {
    experimentId: string;
    strategyVersionId?: number;
    name: string;
    marketRegime?: string;
    exchange?: string;
    periodStart?: Date;
    periodEnd?: Date;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<number> {
    const [row] = await db.insert(experimentsTable).values({
      experimentId: params.experimentId,
      strategyVersionId: params.strategyVersionId,
      name: params.name,
      marketRegime: params.marketRegime,
      exchange: params.exchange ?? "BINANCE",
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      notes: params.notes,
      metadata: params.metadata,
      status: "RUNNING",
    }).returning({ id: experimentsTable.id });
    if (!row) throw new Error("Failed to create experiment");
    return row.id;
  }

  async completeExperiment(experimentId: number, summary: WalkForwardSummary): Promise<void> {
    await db.update(experimentsTable).set({ status: "COMPLETED", completedAt: new Date() }).where(eq(experimentsTable.id, experimentId));
    await this.recordMetrics({ experimentId, metrics: summary.aggregateMetrics, scope: "WALK_FORWARD" });
    for (const item of summary.windows) {
      await db.insert(walkForwardResultsTable).values({
        experimentId,
        windowIndex: item.window.index,
        trainingStart: item.window.trainingStart,
        trainingEnd: item.window.trainingEnd,
        validationStart: item.window.validationStart,
        validationEnd: item.window.validationEnd,
        trainingScore: String(item.trainingScore),
        validationScore: String(item.validationScore),
        metrics: item.validationMetrics,
      });
    }
  }

  private numericMetric(value: number): string {
    if (Number.isFinite(value)) return String(value);
    return value > 0 ? "999999999999" : "-999999999999";
  }
}
