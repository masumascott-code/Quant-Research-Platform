import {
  adaptiveLearningTable,
  backtestsTable,
  db,
  edgeScoresTable,
  executionsTable,
  learningHistoryTable,
  marketContextTable,
  paperTradesTable,
  performanceMetricsTable,
  portfolioTable,
  recommendationsTable,
  setupStatisticsTable,
  tradeReviewsTable,
  type InsertAdaptiveLearning,
  type InsertEdgeScore,
  type InsertLearningHistory,
  type InsertRecommendation,
} from "@workspace/db";
import { desc, eq, gte, sql } from "drizzle-orm";
import type {
  AdaptiveLearningResult,
  EdgeScores,
  LearningBacktest,
  LearningDataset,
  LearningExecutionMetric,
  LearningMarketContext,
  LearningPerformanceMetric,
  LearningPortfolioMetric,
  LearningRecommendation,
  LearningSetupStat,
  LearningTrade,
  LearningTradeReview,
} from "./types";

export class LearningRepository {
  async loadDataset(params: { lookbackDays: number }): Promise<LearningDataset> {
    const from = new Date();
    from.setDate(from.getDate() - params.lookbackDays);

    const [
      trades,
      tradeReviews,
      setupStats,
      performanceMetrics,
      backtests,
      marketContexts,
      executionMetrics,
      portfolioMetrics,
    ] = await Promise.all([
      db.select().from(paperTradesTable).where(gte(paperTradesTable.openedAt, from)).orderBy(desc(paperTradesTable.openedAt)).limit(500),
      db.select().from(tradeReviewsTable).where(gte(tradeReviewsTable.createdAt, from)).orderBy(desc(tradeReviewsTable.createdAt)).limit(500),
      db.select().from(setupStatisticsTable).orderBy(setupStatisticsTable.ranking).limit(100),
      db.select().from(performanceMetricsTable).where(gte(performanceMetricsTable.createdAt, from)).orderBy(desc(performanceMetricsTable.createdAt)).limit(100),
      db.select().from(backtestsTable).where(gte(backtestsTable.createdAt, from)).orderBy(desc(backtestsTable.createdAt)).limit(100),
      db.select().from(marketContextTable).where(gte(marketContextTable.createdAt, from)).orderBy(desc(marketContextTable.createdAt)).limit(500),
      db.select().from(executionsTable).where(gte(executionsTable.createdAt, from)).orderBy(desc(executionsTable.createdAt)).limit(500),
      db.select().from(portfolioTable).orderBy(desc(portfolioTable.updatedAt)).limit(20),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      lookbackDays: params.lookbackDays,
      trades: trades.map(toTrade),
      tradeReviews: tradeReviews.map(toTradeReview),
      setupStats: setupStats.map(toSetupStat),
      performanceMetrics: performanceMetrics.map(toPerformanceMetric),
      backtests: backtests.map(toBacktest),
      marketContexts: marketContexts.map(toMarketContext),
      executionMetrics: executionMetrics.map(toExecutionMetric),
      portfolioMetrics: portfolioMetrics.map(toPortfolioMetric),
    };
  }

  async persistResult(result: AdaptiveLearningResult): Promise<void> {
    const learningRows = await db.insert(adaptiveLearningTable).values(toAdaptiveLearningInsert(result)).returning({ id: adaptiveLearningTable.id });
    const learningRunId = learningRows[0]?.id;
    if (!learningRunId) return;

    await db.insert(edgeScoresTable).values(toEdgeScoreInsert(learningRunId, result.scores));

    if (result.recommendations.length > 0) {
      const insertedRecommendations = await db.insert(recommendationsTable).values(
        result.recommendations.map((recommendation) => toRecommendationInsert(learningRunId, recommendation)),
      ).returning({ id: recommendationsTable.id, recommendationId: recommendationsTable.recommendationId });

      await db.insert(learningHistoryTable).values(
        insertedRecommendations.map((row) => toLearningHistoryInsert(learningRunId, row.id, result.scores)),
      );
    }
  }

  async improvementTimeline(limit = 12) {
    const rows = await db.select().from(edgeScoresTable).orderBy(desc(edgeScoresTable.calculatedAt)).limit(limit);
    return rows.reverse().map((row) => ({
      date: row.calculatedAt.toISOString(),
      improvementScore: toNumber(row.improvementScore),
      learningScore: toNumber(row.learningScore),
      edgeScore: toNumber(row.edgeScore),
    }));
  }

  async acceptanceStats(): Promise<{ accepted: number; rejected: number; pending: number }> {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACCEPTED') AS accepted,
        COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
        COUNT(*) FILTER (WHERE status = 'PENDING_HUMAN_APPROVAL') AS pending
      FROM recommendations
    `);
    const row = (result.rows[0] ?? {}) as Record<string, unknown>;
    return {
      accepted: toNumber(row.accepted),
      rejected: toNumber(row.rejected),
      pending: toNumber(row.pending),
    };
  }

  async recordRecommendationDecision(params: {
    recommendationId: string;
    decision: "ACCEPTED" | "REJECTED";
    notes?: string;
  }): Promise<void> {
    const now = new Date();
    const rows = await db.update(recommendationsTable).set({
      status: params.decision,
      acceptedAt: params.decision === "ACCEPTED" ? now : null,
      rejectedAt: params.decision === "REJECTED" ? now : null,
    }).where(eq(recommendationsTable.recommendationId, params.recommendationId))
      .returning({
        id: recommendationsTable.id,
        learningRunId: recommendationsTable.learningRunId,
      });

    const row = rows[0];
    if (!row?.learningRunId) return;

    await db.insert(learningHistoryTable).values({
      learningRunId: row.learningRunId,
      recommendationRowId: row.id,
      eventType: "HUMAN_DECISION_RECORDED",
      beforeMetrics: {},
      afterMetrics: null,
      performanceDelta: null,
      humanDecision: params.decision,
      notes: params.notes ?? "Human decision recorded. Engine did not apply any configuration change.",
    });
  }

  async recordPerformanceImprovement(params: {
    recommendationId: string;
    beforeMetrics: Record<string, unknown>;
    afterMetrics: Record<string, unknown>;
    performanceDelta: number;
    notes?: string;
  }): Promise<void> {
    const rows = await db.select({
      id: recommendationsTable.id,
      learningRunId: recommendationsTable.learningRunId,
    }).from(recommendationsTable)
      .where(eq(recommendationsTable.recommendationId, params.recommendationId))
      .limit(1);

    const row = rows[0];
    if (!row?.learningRunId) return;

    await db.insert(learningHistoryTable).values({
      learningRunId: row.learningRunId,
      recommendationRowId: row.id,
      eventType: "PERFORMANCE_IMPROVEMENT_RECORDED",
      beforeMetrics: params.beforeMetrics,
      afterMetrics: params.afterMetrics,
      performanceDelta: String(params.performanceDelta),
      humanDecision: "ACCEPTED",
      notes: params.notes ?? "Before vs after performance tracked for a human-approved recommendation.",
    });
  }
}

function toAdaptiveLearningInsert(result: AdaptiveLearningResult): InsertAdaptiveLearning {
  return {
    runId: result.runId,
    scope: "FULL_PLATFORM",
    status: "COMPLETED",
    lookbackDays: result.lookbackDays,
    improvementScore: String(result.scores.improvementScore),
    learningScore: String(result.scores.learningScore),
    edgeScore: String(result.scores.edgeScore),
    traderDisciplineScore: String(result.scores.traderDisciplineScore),
    consistencyScore: String(result.scores.consistencyScore),
    detectedPatterns: {
      mistakes: result.mistakeAnalysis.repeatedMistakes,
      highRiskBehaviours: result.mistakeAnalysis.highRiskBehaviours,
      strongStrategies: result.strategyOptimization.strongStrategies,
      weakStrategies: result.strategyOptimization.weakStrategies,
      sessions: result.sessionOptimization.sessions,
      regimes: result.marketRegimeOptimization.regimes,
    },
    summary: result.weeklyReport.summary,
  };
}

function toEdgeScoreInsert(learningRunId: number, scores: EdgeScores): InsertEdgeScore {
  return {
    learningRunId,
    scope: "PLATFORM",
    improvementScore: String(scores.improvementScore),
    learningScore: String(scores.learningScore),
    edgeScore: String(scores.edgeScore),
    traderDisciplineScore: String(scores.traderDisciplineScore),
    consistencyScore: String(scores.consistencyScore),
    components: scores.components,
  };
}

function toRecommendationInsert(learningRunId: number, recommendation: LearningRecommendation): InsertRecommendation {
  return {
    learningRunId,
    recommendationId: recommendation.recommendationId,
    category: recommendation.category,
    target: recommendation.target,
    currentValue: toJson(recommendation.currentValue),
    recommendedValue: toJson(recommendation.recommendedValue) ?? null,
    rationale: recommendation.rationale,
    confidence: String(recommendation.confidence),
    impactEstimate: String(recommendation.impactEstimate),
    evidence: recommendation.evidence,
    status: recommendation.status,
  };
}

function toLearningHistoryInsert(learningRunId: number, recommendationRowId: number, scores: EdgeScores): InsertLearningHistory {
  return {
    learningRunId,
    recommendationRowId,
    eventType: "RECOMMENDATION_CREATED",
    beforeMetrics: scores,
    afterMetrics: null,
    performanceDelta: null,
    humanDecision: "PENDING",
    notes: "Recommendation created by AdaptiveLearningEngine. Human approval required before any parameter change.",
  };
}

function toTrade(row: typeof paperTradesTable.$inferSelect): LearningTrade {
  return {
    id: row.id,
    tradeId: row.tradeId,
    symbol: row.symbol,
    direction: row.direction,
    setupType: row.setupType,
    status: row.status,
    result: row.result,
    signalScore: toNumber(row.signalScore),
    pnl: toNumber(row.pnl),
    pnlPercent: row.pnlPercent == null ? null : toNumber(row.pnlPercent),
    maxDrawdown: row.maxDrawdown == null ? null : toNumber(row.maxDrawdown),
    maxProfit: row.maxProfit == null ? null : toNumber(row.maxProfit),
    holdingDurationMinutes: row.holdingDurationMinutes,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
  };
}

function toTradeReview(row: typeof tradeReviewsTable.$inferSelect): LearningTradeReview {
  return {
    tradeId: row.tradeId,
    symbol: row.symbol,
    direction: row.direction,
    result: row.result,
    analysisReason: row.analysisReason,
    lessonsLearned: row.lessonsLearned,
    improvementNotes: row.improvementNotes,
    setupQuality: row.setupQuality,
    winningFactors: row.winningFactors,
    losingFactors: row.losingFactors,
    createdAt: row.createdAt,
  };
}

function toSetupStat(row: typeof setupStatisticsTable.$inferSelect): LearningSetupStat {
  return {
    setupType: row.setupType,
    direction: row.direction,
    totalTrades: row.totalTrades,
    wins: row.wins,
    losses: row.losses,
    breakevens: row.breakevens,
    winRate: toNumber(row.winRate),
    avgPnl: toNumber(row.avgPnl),
    avgScore: toNumber(row.avgScore),
    ranking: row.ranking,
  };
}

function toPerformanceMetric(row: typeof performanceMetricsTable.$inferSelect): LearningPerformanceMetric {
  return {
    scope: row.scope,
    winRate: toNumber(row.winRate),
    profitFactor: toNumber(row.profitFactor),
    expectancy: toNumber(row.expectancy),
    sharpeRatio: toNumber(row.sharpeRatio),
    maxDrawdown: toNumber(row.maxDrawdown),
    averageRisk: toNumber(row.averageRisk),
    totalReturn: toNumber(row.totalReturn),
    tradeCount: row.tradeCount,
    createdAt: row.createdAt,
  };
}

function toBacktest(row: typeof backtestsTable.$inferSelect): LearningBacktest {
  return {
    runId: row.runId,
    status: row.status,
    symbol: row.symbol,
    timeframe: row.timeframe,
    marketRegime: row.marketRegime,
    initialEquity: toNumber(row.initialEquity),
    finalEquity: row.finalEquity == null ? null : toNumber(row.finalEquity),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function toMarketContext(row: typeof marketContextTable.$inferSelect): LearningMarketContext {
  return {
    symbol: row.symbol,
    marketRegime: row.marketRegime,
    session: row.session,
    confidence: toNumber(row.confidence),
    liquidityScore: toNumber(row.liquidityScore),
    trendScore: toNumber(row.trendScore),
    volumeScore: toNumber(row.volumeScore),
    volatilityScore: toNumber(row.volatilityScore),
    riskGrade: row.riskGrade,
    createdAt: row.createdAt,
  };
}

function toExecutionMetric(row: typeof executionsTable.$inferSelect): LearningExecutionMetric {
  return {
    symbol: row.symbol,
    status: row.status,
    entrySlippage: toNumber(row.entrySlippage),
    exitSlippage: toNumber(row.exitSlippage),
    executionDelayMs: row.executionDelayMs,
    fillRatio: toNumber(row.fillRatio),
    createdAt: row.createdAt,
  };
}

function toPortfolioMetric(row: typeof portfolioTable.$inferSelect): LearningPortfolioMetric {
  return {
    totalEquity: toNumber(row.totalEquity),
    freeEquity: toNumber(row.freeEquity),
    openExposure: toNumber(row.openExposure),
    dailyPnl: toNumber(row.dailyPnl),
    riskUsagePercent: toNumber(row.riskUsagePercent),
    updatedAt: row.updatedAt,
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toJson(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as null | boolean | number | string | unknown[] | Record<string, unknown>;
}
