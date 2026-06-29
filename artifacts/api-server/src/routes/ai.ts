import { Router, type NextFunction, type Request, type Response } from "express";
import {
  db,
  dailyPerformanceTable,
  marketContextTable,
  paperTradesTable,
  scannerDecisionsTable,
  setupStatisticsTable,
  tradeReviewsTable,
} from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  aiInsightService,
  aiJournal,
  aiMentor,
  aiReportService,
  ContextBuilder,
  type AIContext,
  AIProviderError,
  type AIPromptTemplate,
  type ParsedAIInsight,
  type TradeContextSummary,
} from "../core/ai";

type TradeRow = typeof paperTradesTable.$inferSelect;
type TradeReviewRow = typeof tradeReviewsTable.$inferSelect;
type SetupStatRow = typeof setupStatisticsTable.$inferSelect;

export interface AIReadModel {
  platformContext(params?: { symbol?: string }): Promise<AIContext>;
  dashboard(): Promise<AIDashboardPayload>;
  tradeReviewTarget(tradeId?: string): Promise<TradeContextSummary | null>;
  journal(): Promise<JournalPayload>;
  marketSummary(symbol?: string): Promise<MarketSummaryPayload>;
  strategyComparison(): Promise<StrategyComparisonPayload>;
}

export interface AIRouteServices {
  insight: {
    generateInsight(params: {
      template: AIPromptTemplate;
      context?: AIContext;
      symbol?: string;
      instruction?: string;
    }): Promise<ParsedAIInsight>;
  };
  mentor: {
    reviewTrade(trade: TradeContextSummary, context?: AIContext): Promise<ParsedAIInsight>;
  };
  journal: {
    summarizeToday(notes?: string[]): Promise<ParsedAIInsight>;
  };
  reports: {
    dailyReport(): Promise<ParsedAIInsight>;
    weeklyReport(): Promise<ParsedAIInsight>;
  };
  readModel: AIReadModel;
}

interface AIDashboardPayload {
  context: AIContext;
  widgets: {
    todayPerformance: {
      date: string;
      trades: number;
      winRate: number;
      pnl: number;
    };
    winRate: number;
    pnl: number;
    risk: {
      grade: string;
      usagePercent: number;
      marketRisk: string;
    };
    bestTrade: ReturnType<typeof formatTrade> | null;
    worstTrade: ReturnType<typeof formatTrade> | null;
    currentMarketRegime: string;
    topOpportunities: Array<{
      symbol: string;
      direction: string;
      decision: string;
      strategy: string;
      score: number;
      confidence: number;
      riskGrade: string;
      createdAt: Date;
    }>;
    journalSummary: {
      notes: string[];
      lessons: string[];
      recurringProblems: string[];
    };
  };
}

interface JournalPayload {
  timeline: Array<{
    id: number;
    tradeId: string;
    symbol: string;
    direction: string;
    result: string;
    setupQuality: string | null;
    createdAt: Date;
  }>;
  mistakes: string[];
  lessons: string[];
  recurringProblems: string[];
  dailySummary: string;
  weeklySummary: string;
}

interface MarketSummaryPayload {
  currentRegime: string;
  session: string;
  trend: number;
  liquidity: number;
  topMovers: Array<{
    symbol: string;
    regime: string;
    trendScore: number;
    liquidityScore: number;
    riskGrade: string;
  }>;
  marketRisk: string;
}

interface StrategyComparisonPayload {
  strategies: Array<{
    setupType: string;
    direction: string;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    avgPnl: number;
    avgScore: number;
    ranking: number | null;
  }>;
  bestStrategy: string | null;
  weakestStrategy: string | null;
}

class DatabaseAIReadModel implements AIReadModel {
  private readonly contextBuilder = new ContextBuilder();

  async platformContext(params: { symbol?: string } = {}): Promise<AIContext> {
    return await this.contextBuilder.buildPlatformContext(params);
  }

  async dashboard(): Promise<AIDashboardPayload> {
    const context = await this.platformContext();
    const today = new Date().toISOString().slice(0, 10);
    const opportunityFreshSince = new Date(Date.now() - 4 * 60 * 60 * 1000);

    const [
      todayRows,
      closedRows,
      bestTradeRows,
      worstTradeRows,
      opportunityRows,
      latestReviews,
    ] = await Promise.all([
      db.select().from(dailyPerformanceTable).where(eq(dailyPerformanceTable.date, today)).limit(1),
      db.execute(sql`
        SELECT
          COUNT(*) AS total_trades,
          COALESCE(SUM(pnl::numeric), 0) AS total_pnl,
          AVG(CASE WHEN result = 'WIN' THEN 1.0 ELSE 0.0 END) AS win_rate
        FROM paper_trades
        WHERE status = 'closed'
      `),
      db.select().from(paperTradesTable).where(eq(paperTradesTable.status, "closed")).orderBy(desc(paperTradesTable.pnl)).limit(1),
      db.select().from(paperTradesTable).where(eq(paperTradesTable.status, "closed")).orderBy(sql`pnl::numeric ASC`).limit(1),
      db.select()
        .from(scannerDecisionsTable)
        .where(and(
          eq(scannerDecisionsTable.decision, "ACCEPTED"),
          gte(scannerDecisionsTable.createdAt, opportunityFreshSince),
        ))
        .orderBy(desc(scannerDecisionsTable.finalScore))
        .limit(5),
      db.select().from(tradeReviewsTable).orderBy(desc(tradeReviewsTable.createdAt)).limit(10),
    ]);

    const todayRow = todayRows[0];
    const performance = (closedRows.rows[0] ?? {}) as Record<string, unknown>;
    const journalSummary = summarizeReviews(latestReviews);

    return {
      context,
      widgets: {
        todayPerformance: {
          date: today,
          trades: Number(todayRow?.trades ?? 0),
          winRate: toNumber(todayRow?.winRate),
          pnl: toNumber(todayRow?.pnl),
        },
        winRate: toNumber(performance.win_rate),
        pnl: toNumber(performance.total_pnl),
        risk: {
          grade: context.market?.riskGrade ?? "UNKNOWN",
          usagePercent: context.portfolio?.riskUsagePercent ?? 0,
          marketRisk: context.market?.riskGrade ?? "UNKNOWN",
        },
        bestTrade: bestTradeRows[0] ? formatTrade(bestTradeRows[0]) : null,
        worstTrade: worstTradeRows[0] ? formatTrade(worstTradeRows[0]) : null,
        currentMarketRegime: context.market?.marketRegime ?? "UNKNOWN",
        topOpportunities: opportunityRows.map((row) => ({
          symbol: row.symbol,
          direction: row.direction,
          decision: row.decision,
          strategy: row.strategy,
          score: toNumber(row.finalScore),
          confidence: toNumber(row.confidence),
          riskGrade: row.riskGrade,
          createdAt: row.createdAt,
        })),
        journalSummary,
      },
    };
  }

  async tradeReviewTarget(tradeId?: string): Promise<TradeContextSummary | null> {
    const rows = tradeId
      ? await db.select().from(paperTradesTable).where(eq(paperTradesTable.tradeId, tradeId)).limit(1)
      : await db.select().from(paperTradesTable).orderBy(desc(paperTradesTable.openedAt)).limit(1);

    return rows[0] ? toTradeContext(rows[0]) : null;
  }

  async journal(): Promise<JournalPayload> {
    const reviews = await db.select().from(tradeReviewsTable).orderBy(desc(tradeReviewsTable.createdAt)).limit(30);
    const summary = summarizeReviews(reviews);

    return {
      timeline: reviews.map((review) => ({
        id: review.id,
        tradeId: review.tradeId,
        symbol: review.symbol,
        direction: review.direction,
        result: review.result,
        setupQuality: review.setupQuality,
        createdAt: review.createdAt,
      })),
      mistakes: summary.notes,
      lessons: summary.lessons,
      recurringProblems: summary.recurringProblems,
      dailySummary: summary.notes[0] ?? "No journal entries recorded today.",
      weeklySummary: summary.lessons[0] ?? "No weekly lesson summary available yet.",
    };
  }

  async marketSummary(symbol?: string): Promise<MarketSummaryPayload> {
    const context = await this.platformContext({ symbol });
    const topRows = await db.select().from(marketContextTable).orderBy(desc(marketContextTable.opportunityRank)).limit(8);

    return {
      currentRegime: context.market?.marketRegime ?? "UNKNOWN",
      session: context.market?.session ?? "UNKNOWN",
      trend: context.market?.trendScore ?? 0,
      liquidity: context.market?.liquidityScore ?? 0,
      topMovers: topRows.map((row) => ({
        symbol: row.symbol,
        regime: row.marketRegime,
        trendScore: toNumber(row.trendScore),
        liquidityScore: toNumber(row.liquidityScore),
        riskGrade: row.riskGrade,
      })),
      marketRisk: context.market?.riskGrade ?? "UNKNOWN",
    };
  }

  async strategyComparison(): Promise<StrategyComparisonPayload> {
    const rows = await db.select().from(setupStatisticsTable).orderBy(setupStatisticsTable.ranking).limit(20);
    const strategies = rows.map(formatStrategy);
    const sorted = [...strategies].sort((a, b) => b.winRate - a.winRate || b.avgPnl - a.avgPnl);

    return {
      strategies,
      bestStrategy: sorted[0] ? `${sorted[0].setupType} ${sorted[0].direction}` : null,
      weakestStrategy: sorted.at(-1) ? `${sorted.at(-1)?.setupType} ${sorted.at(-1)?.direction}` : null,
    };
  }
}

const defaultServices: AIRouteServices = {
  insight: aiInsightService,
  mentor: aiMentor,
  journal: aiJournal,
  reports: aiReportService,
  readModel: new DatabaseAIReadModel(),
};

export function createAIRouter(services: AIRouteServices = defaultServices): Router {
  const router = Router();

  router.get("/dashboard", asyncRoute(async (_req, res) => {
    const dashboard = await services.readModel.dashboard();
    const insight = await services.insight.generateInsight({
      template: "PERFORMANCE_ANALYSIS",
      context: dashboard.context,
      instruction: "Create concise, advisory-only dashboard recommendations. Never suggest placing or modifying orders.",
    });

    res.json(aiEnvelope({
      ...dashboard,
      recommendations: insight.suggestedImprovements,
      insight,
    }));
  }));

  router.get("/mentor", asyncRoute(async (req, res) => {
    const question = stringQuery(req.query.question) ?? "What should I learn from the current trading context?";
    const symbol = stringQuery(req.query.symbol);
    const context = await services.readModel.platformContext({ symbol });
    const insight = await services.insight.generateInsight({
      template: "PERFORMANCE_ANALYSIS",
      context,
      symbol,
      instruction: `Answer this mentoring question in read-only advisory mode: ${question}. Do not execute, place, cancel, or modify trades.`,
    });

    res.json(aiEnvelope({ question, symbol, insight }));
  }));

  router.get("/trade-review", asyncRoute(async (req, res) => {
    const tradeId = stringQuery(req.query.tradeId);
    const trade = await services.readModel.tradeReviewTarget(tradeId);

    if (!trade) {
      res.status(404).json({ error: "No trade available for AI review" });
      return;
    }

    const context = await services.readModel.platformContext({ symbol: trade.symbol });
    const insight = await services.mentor.reviewTrade(trade, context);

    res.json(aiEnvelope({
      trade,
      explain: {
        entry: trade.entryPrice,
        exit: trade.closedAt ? trade.result ?? "CLOSED" : "OPEN",
        risk: trade.stopLoss,
        strengths: insight.strengths,
        weaknesses: insight.weaknesses,
        mistakes: insight.riskFactors,
        alternativeScenario: insight.alternativeScenarios[0] ?? "No alternative scenario returned.",
      },
      insight,
    }));
  }));

  router.get("/daily-report", asyncRoute(async (_req, res) => {
    const insight = await services.reports.dailyReport();
    res.json(aiEnvelope({ reportType: "daily", insight }));
  }));

  router.get("/weekly-report", asyncRoute(async (_req, res) => {
    const insight = await services.reports.weeklyReport();
    res.json(aiEnvelope({ reportType: "weekly", insight }));
  }));

  router.get("/journal", asyncRoute(async (req, res) => {
    const notes = arrayQuery(req.query.notes);
    const [journal, insight] = await Promise.all([
      services.readModel.journal(),
      services.journal.summarizeToday(notes),
    ]);

    res.json(aiEnvelope({ journal, insight }));
  }));

  router.get("/market-summary", asyncRoute(async (req, res) => {
    const symbol = stringQuery(req.query.symbol);
    const context = await services.readModel.platformContext({ symbol });
    const [market, insight] = await Promise.all([
      services.readModel.marketSummary(symbol),
      services.insight.generateInsight({
        template: "MARKET_SUMMARY",
        context,
        symbol,
        instruction: "Summarize regime, session, trend, liquidity, top movers, and market risk. Advisory only.",
      }),
    ]);

    res.json(aiEnvelope({ market, insight }));
  }));

  router.get("/strategy-review", asyncRoute(async (_req, res) => {
    const context = await services.readModel.platformContext();
    const [comparison, insight] = await Promise.all([
      services.readModel.strategyComparison(),
      services.insight.generateInsight({
        template: "STRATEGY_REVIEW",
        context,
        instruction: "Compare strategies by performance, market suitability, and improvements. Do not recommend execution.",
      }),
    ]);

    res.json(aiEnvelope({ comparison, insight }));
  }));

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "AI service failed";
    const quotaExhausted = err instanceof AIProviderError && /quota exhausted/i.test(message);

    res.status(quotaExhausted ? 429 : 503).json({
      error: quotaExhausted ? "AI quota exhausted" : "AI service unavailable",
      message,
      advisoryOnly: true,
    });
  });

  return router;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function aiEnvelope<T extends Record<string, unknown>>(payload: T): T & { advisoryOnly: true; generatedAt: string } {
  return {
    advisoryOnly: true,
    generatedAt: new Date().toISOString(),
    ...payload,
  };
}

function stringQuery(value: unknown): string | undefined {
  if (Array.isArray(value)) return stringQuery(value[0]);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayQuery(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(arrayQuery);
  if (typeof value !== "string") return [];
  return value.split("\n").map((note) => note.trim()).filter(Boolean);
}

function summarizeReviews(reviews: TradeReviewRow[]): AIDashboardPayload["widgets"]["journalSummary"] {
  return {
    notes: uniqueStrings(reviews.map((review) => review.improvementNotes).filter(Boolean) as string[]).slice(0, 5),
    lessons: uniqueStrings(reviews.map((review) => review.lessonsLearned).filter(Boolean)).slice(0, 5),
    recurringProblems: uniqueStrings(
      reviews
        .filter((review) => review.result === "LOSS" || review.setupQuality === "poor")
        .map((review) => review.losingFactors ?? review.analysisReason)
        .filter(Boolean),
    ).slice(0, 5),
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatTrade(row: TradeRow) {
  return {
    id: row.id,
    tradeId: row.tradeId,
    symbol: row.symbol,
    direction: row.direction,
    setupType: row.setupType,
    entryPrice: toNumber(row.entryPrice),
    stopLoss: toNumber(row.stopLoss),
    tp1: toNumber(row.tp1),
    tp2: toNumber(row.tp2),
    tp3: toNumber(row.tp3),
    quantity: toNumber(row.quantity),
    signalScore: toNumber(row.signalScore),
    signalGrade: row.signalGrade,
    status: row.status,
    result: row.result,
    exitPrice: row.exitPrice == null ? null : toNumber(row.exitPrice),
    exitReason: row.exitReason,
    pnl: row.pnl == null ? null : toNumber(row.pnl),
    pnlPercent: row.pnlPercent == null ? null : toNumber(row.pnlPercent),
    openedAt: row.openedAt,
    closedAt: row.closedAt,
  };
}

function toTradeContext(row: TradeRow): TradeContextSummary {
  return {
    symbol: row.symbol,
    direction: row.direction,
    status: row.status,
    setupType: row.setupType,
    entryPrice: toNumber(row.entryPrice),
    stopLoss: toNumber(row.stopLoss),
    tp1: toNumber(row.tp1),
    tp2: toNumber(row.tp2),
    tp3: toNumber(row.tp3),
    quantity: toNumber(row.quantity),
    signalScore: toNumber(row.signalScore),
    result: row.result,
    pnl: row.pnl == null ? null : toNumber(row.pnl),
    openedAt: row.openedAt,
    closedAt: row.closedAt,
  };
}

function formatStrategy(row: SetupStatRow) {
  return {
    setupType: row.setupType,
    direction: row.direction,
    totalTrades: row.totalTrades,
    wins: row.wins,
    losses: row.losses,
    winRate: toNumber(row.winRate),
    avgPnl: toNumber(row.avgPnl),
    avgScore: toNumber(row.avgScore),
    ranking: row.ranking,
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default createAIRouter();
