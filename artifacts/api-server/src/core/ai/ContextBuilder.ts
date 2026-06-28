import {
  db,
  executionsTable,
  marketContextTable,
  paperTradesTable,
  performanceMetricsTable,
  scannerDecisionsTable,
} from "@workspace/db";
import { desc, eq, avg, count } from "drizzle-orm";
import { portfolioService } from "../portfolio";
import type {
  AIContext,
  ExecutionContextSummary,
  JournalContextSummary,
  MarketContextSummary,
  ResearchContextSummary,
  ScannerDecisionSummary,
  TradeContextSummary,
} from "./types";

export class ContextBuilder {
  async buildPlatformContext(params: { symbol?: string; includeJournal?: JournalContextSummary } = {}): Promise<AIContext> {
    const [market, scannerDecision, portfolio, openTrades, closedTrades, execution, research] = await Promise.all([
      this.latestMarketContext(params.symbol),
      this.latestScannerDecision(params.symbol),
      portfolioService.getSummary().catch(() => undefined),
      this.recentTrades("open", 10),
      this.recentTrades("closed", 25),
      this.executionSummary(),
      this.researchSummary(),
    ]);

    return this.sanitizeContext({
      generatedAt: new Date().toISOString(),
      market,
      scannerDecision,
      portfolio,
      openTrades,
      closedTrades,
      execution,
      research,
      performance: research,
      journal: params.includeJournal,
    });
  }

  buildFromParts(context: Omit<AIContext, "generatedAt">): AIContext {
    return this.sanitizeContext({ generatedAt: new Date().toISOString(), ...context });
  }

  private async latestMarketContext(symbol?: string): Promise<MarketContextSummary | undefined> {
    const query = db.select().from(marketContextTable);
    const rows = symbol
      ? await query.where(eq(marketContextTable.symbol, symbol)).orderBy(desc(marketContextTable.createdAt)).limit(1)
      : await query.orderBy(desc(marketContextTable.createdAt)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      symbol: row.symbol,
      marketRegime: row.marketRegime,
      session: row.session,
      confidence: Number(row.confidence),
      liquidityScore: Number(row.liquidityScore),
      trendScore: Number(row.trendScore),
      volumeScore: Number(row.volumeScore),
      volatilityScore: Number(row.volatilityScore),
      riskGrade: row.riskGrade,
    };
  }

  private async latestScannerDecision(symbol?: string): Promise<ScannerDecisionSummary | undefined> {
    const query = db.select().from(scannerDecisionsTable);
    const rows = symbol
      ? await query.where(eq(scannerDecisionsTable.symbol, symbol)).orderBy(desc(scannerDecisionsTable.createdAt)).limit(1)
      : await query.orderBy(desc(scannerDecisionsTable.createdAt)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      symbol: row.symbol,
      direction: row.direction,
      decision: row.decision,
      strategy: row.strategy,
      finalScore: Number(row.finalScore),
      confidence: Number(row.confidence),
      marketRegime: row.marketRegime,
      riskGrade: row.riskGrade,
      reasons: row.reasons,
    };
  }

  private async recentTrades(status: "open" | "closed", limit: number): Promise<TradeContextSummary[]> {
    const rows = await db
      .select()
      .from(paperTradesTable)
      .where(eq(paperTradesTable.status, status))
      .orderBy(desc(status === "open" ? paperTradesTable.openedAt : paperTradesTable.closedAt))
      .limit(limit);

    return rows.map((row) => ({
      symbol: row.symbol,
      direction: row.direction,
      status: row.status,
      setupType: row.setupType,
      entryPrice: Number(row.entryPrice),
      stopLoss: Number(row.stopLoss),
      tp1: Number(row.tp1),
      tp2: Number(row.tp2),
      tp3: Number(row.tp3),
      quantity: Number(row.quantity),
      signalScore: Number(row.signalScore),
      result: row.result,
      pnl: row.pnl == null ? null : Number(row.pnl),
      openedAt: row.openedAt,
      closedAt: row.closedAt,
    }));
  }

  private async executionSummary(): Promise<ExecutionContextSummary | undefined> {
    const [row] = await db
      .select({
        totalExecutions: count(),
        averageSlippage: avg(executionsTable.entrySlippage),
        averageExitSlippage: avg(executionsTable.exitSlippage),
        averageFillRatio: avg(executionsTable.fillRatio),
        averageDelayMs: avg(executionsTable.executionDelayMs),
      })
      .from(executionsTable);

    if (!row || Number(row.totalExecutions) === 0) return undefined;
    const entry = Number(row.averageSlippage ?? 0);
    const exit = Number(row.averageExitSlippage ?? 0);
    return {
      totalExecutions: Number(row.totalExecutions),
      averageSlippage: (entry + exit) / 2,
      averageFillRatio: Number(row.averageFillRatio ?? 0),
      averageDelayMs: Number(row.averageDelayMs ?? 0),
    };
  }

  private async researchSummary(): Promise<ResearchContextSummary | undefined> {
    const [row] = await db.select().from(performanceMetricsTable).orderBy(desc(performanceMetricsTable.createdAt)).limit(1);
    if (!row) return undefined;
    return {
      latestBacktestReturn: Number(row.totalReturn),
      latestWinRate: Number(row.winRate),
      latestProfitFactor: Number(row.profitFactor),
      latestMaxDrawdown: Number(row.maxDrawdown),
      tradeCount: row.tradeCount,
    };
  }

  private sanitizeContext(context: AIContext): AIContext {
    return JSON.parse(JSON.stringify(context, (_key, value) => {
      if (typeof value !== "string") return value;
      return value
        .replace(/GEMINI_API_KEY\s*=\s*\S+/gi, "GEMINI_API_KEY=[REDACTED]")
        .replace(/JWT_SECRET\s*=\s*\S+/gi, "JWT_SECRET=[REDACTED]")
        .replace(/DATABASE_URL\s*=\s*\S+/gi, "DATABASE_URL=[REDACTED]")
        .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");
    })) as AIContext;
  }
}
