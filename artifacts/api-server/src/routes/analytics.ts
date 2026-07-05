import { Router } from "express";
import { db } from "@workspace/db";
import { paperTradesTable, dailyPerformanceTable, setupStatisticsTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";

const router = Router();

router.get("/dashboard", async (req, res) => {
  const [performance, recentTrades, dailyPerformance, setupStats] = await Promise.all([
    getPerformance(),
    db.select().from(paperTradesTable).orderBy(desc(paperTradesTable.openedAt)).limit(10),
    db.select().from(dailyPerformanceTable).orderBy(desc(dailyPerformanceTable.date)).limit(30),
    db.select().from(setupStatisticsTable).orderBy(setupStatisticsTable.ranking).limit(20),
  ]);

  res.json({
    performance,
    recentTrades: recentTrades.map(formatTrade),
    dailyPerformance: dailyPerformance.map(formatDaily),
    setupStats: setupStats.map(formatSetupStat),
  });
});

router.get("/performance", async (req, res) => {
  const perf = await getPerformance(parseSource(req.query.source));
  res.json(perf);
});

router.get("/daily", async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const from = new Date();
  from.setDate(from.getDate() - days);

  const rows = await db
    .select()
    .from(dailyPerformanceTable)
    .where(gte(dailyPerformanceTable.date, from.toISOString().slice(0, 10)))
    .orderBy(dailyPerformanceTable.date);

  res.json(rows.map(formatDaily));
});

router.get("/setup-stats", async (req, res) => {
  const stats = await db
    .select()
    .from(setupStatisticsTable)
    .orderBy(setupStatisticsTable.ranking);

  res.json(stats.map(formatSetupStat));
});

router.get("/best-hours", async (req, res) => {
  const hourlyResult = await db.execute(sql`
    SELECT
      EXTRACT(HOUR FROM opened_at)::int AS hour,
      COUNT(*) AS trades,
      AVG(CASE WHEN result = 'WIN' THEN 1.0 ELSE 0.0 END) AS win_rate,
      AVG(COALESCE(pnl::numeric, 0)) AS avg_pnl
    FROM paper_trades
    WHERE status = 'closed'
    GROUP BY hour
    ORDER BY hour
  `);

  const hourlyStats = (hourlyResult.rows as any[]).map((r: any) => ({
    hour: Number(r.hour),
    trades: Number(r.trades),
    winRate: Number(r.win_rate),
    avgPnl: Number(r.avg_pnl),
  }));

  const sorted = [...hourlyStats].sort((a, b) => b.winRate - a.winRate);
  const bestHours = sorted.slice(0, 3).map(h => h.hour);
  const worstHours = sorted.slice(-3).map(h => h.hour);

  res.json({ hourlyStats, bestHours, worstHours });
});

router.get("/pnl-curve", async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const from = new Date();
  from.setDate(from.getDate() - days);

  const result = await db.execute(sql`
    SELECT
      DATE(closed_at) AS date,
      SUM(pnl::numeric) AS daily_pnl,
      SUM(SUM(pnl::numeric)) OVER (ORDER BY DATE(closed_at)) AS cumulative_pnl
    FROM paper_trades
    WHERE status = 'closed'
      AND closed_at >= ${from.toISOString()}
    GROUP BY DATE(closed_at)
    ORDER BY DATE(closed_at)
  `);

  res.json((result.rows as any[]).map((r: any) => ({
    date: r.date,
    dailyPnl: Number(r.daily_pnl),
    cumulativePnl: Number(r.cumulative_pnl),
  })));
});

router.get("/direction-performance", async (req, res) => {
  const days = parseWindowDays(req.query.days, 90);
  const from = new Date();
  from.setDate(from.getDate() - days);

  const closedTrades = await db
    .select()
    .from(paperTradesTable)
    .where(and(eq(paperTradesTable.status, "closed"), gte(paperTradesTable.closedAt, from)));
  const source = parseSource(req.query.source);
  const scopedTrades = source ? closedTrades.filter((trade) => trade.source === source) : closedTrades;

  const longTrades = scopedTrades.filter((trade) => trade.direction === "LONG");
  const shortTrades = scopedTrades.filter((trade) => trade.direction === "SHORT");
  const longSummary = summarizeDirection(longTrades);
  const shortSummary = summarizeDirection(shortTrades);
  const symbolSummaries = summarizeSymbols(scopedTrades);

  res.json({
    days,
    from,
    source: source ?? "ALL",
    closedLongTradeCount: longSummary.closedTradeCount,
    closedShortTradeCount: shortSummary.closedTradeCount,
    longWinRate: longSummary.winRate,
    shortWinRate: shortSummary.winRate,
    averageLongPnl: longSummary.averagePnl,
    averageShortPnl: shortSummary.averagePnl,
    averageLongScore: longSummary.averageScore,
    averageShortScore: shortSummary.averageScore,
    averageLongDurationMinutes: longSummary.averageDurationMinutes,
    averageShortDurationMinutes: shortSummary.averageDurationMinutes,
    bestSymbols: symbolSummaries.slice(0, 5),
    worstSymbols: [...symbolSummaries].reverse().slice(0, 5),
    byDirection: {
      LONG: longSummary,
      SHORT: shortSummary,
    },
  });
});

async function getPerformance(source?: "TECHNICAL" | "SMC") {
  const allClosed = await db
    .select()
    .from(paperTradesTable)
    .where(eq(paperTradesTable.status, "closed"));

  const scopedClosed = source ? allClosed.filter((trade) => trade.source === source) : allClosed;
  const summary = summarizeTrades(scopedClosed);

  const bestTrade = [...scopedClosed].sort((a, b) => Number(b.pnl ?? 0) - Number(a.pnl ?? 0))[0];
  const worstTrade = [...scopedClosed].sort((a, b) => Number(a.pnl ?? 0) - Number(b.pnl ?? 0))[0];
  const smcTrades = allClosed.filter((trade) => trade.source === "SMC");
  const technicalTrades = allClosed.filter((trade) => trade.source !== "SMC");

  return {
    source: source ?? "ALL",
    totalTrades: summary.closedTradeCount,
    wins: summary.wins,
    losses: summary.losses,
    breakevens: summary.breakevens,
    winRate: summary.winRate,
    totalPnl: summary.totalPnl,
    avgPnl: summary.averagePnl,
    avgWin: summary.averageWinPnl,
    avgLoss: summary.averageLossPnl,
    profitFactor: summary.profitFactor,
    maxDrawdown: 0,
    avgHoldingMinutes: summary.averageDurationMinutes,
    avgScore: summary.averageScore,
    bestTrade: bestTrade ? formatTrade(bestTrade) : null,
    worstTrade: worstTrade ? formatTrade(worstTrade) : null,
    scannerComparison: {
      technical: summarizeTrades(technicalTrades),
      smc: {
        ...summarizeTrades(smcTrades),
        longWinRate: summarizeDirection(smcTrades.filter((trade) => trade.direction === "LONG")).winRate,
        shortWinRate: summarizeDirection(smcTrades.filter((trade) => trade.direction === "SHORT")).winRate,
        bestSymbols: summarizeSymbols(smcTrades).slice(0, 5),
        worstSymbols: [...summarizeSymbols(smcTrades)].reverse().slice(0, 5),
      },
    },
  };
}

router.get("/scanner-comparison", async (_req, res) => {
  const closedTrades = await db
    .select()
    .from(paperTradesTable)
    .where(eq(paperTradesTable.status, "closed"));
  const technicalTrades = closedTrades.filter((trade) => trade.source !== "SMC");
  const smcTrades = closedTrades.filter((trade) => trade.source === "SMC");

  res.json({
    technical: summarizeTrades(technicalTrades),
    smc: {
      ...summarizeTrades(smcTrades),
      longWinRate: summarizeDirection(smcTrades.filter((trade) => trade.direction === "LONG")).winRate,
      shortWinRate: summarizeDirection(smcTrades.filter((trade) => trade.direction === "SHORT")).winRate,
      bestSymbols: summarizeSymbols(smcTrades).slice(0, 5),
      worstSymbols: [...summarizeSymbols(smcTrades)].reverse().slice(0, 5),
    },
  });
});

function parseWindowDays(value: unknown, defaultDays: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultDays;
  return Math.min(Math.max(Math.floor(parsed), 1), 3650);
}

function parseSource(value: unknown): "TECHNICAL" | "SMC" | undefined {
  return value === "TECHNICAL" || value === "SMC" ? value : undefined;
}

function summarizeTrades(trades: Array<typeof paperTradesTable.$inferSelect>) {
  const wins = trades.filter((trade) => trade.result === "WIN");
  const losses = trades.filter((trade) => trade.result === "LOSS");
  const breakevens = trades.filter((trade) => trade.result === "BREAKEVEN");
  const totalWinPnl = wins.reduce((sumValue, trade) => sumValue + Number(trade.pnl ?? 0), 0);
  const totalLossPnl = Math.abs(losses.reduce((sumValue, trade) => sumValue + Number(trade.pnl ?? 0), 0));

  return {
    closedTradeCount: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRate: trades.length > 0 ? wins.length / trades.length : 0,
    totalPnl: trades.reduce((sumValue, trade) => sumValue + Number(trade.pnl ?? 0), 0),
    averagePnl: averageNumber(trades.map((trade) => Number(trade.pnl ?? 0))),
    averageWinPnl: averageNumber(wins.map((trade) => Number(trade.pnl ?? 0))),
    averageLossPnl: averageNumber(losses.map((trade) => Number(trade.pnl ?? 0))),
    averageScore: averageNumber(trades.map((trade) => Number(trade.signalScore))),
    averageDurationMinutes: averageNumber(trades.map((trade) => Number(trade.holdingDurationMinutes))),
    profitFactor: totalLossPnl > 0 ? totalWinPnl / totalLossPnl : 0,
  };
}

function summarizeDirection(trades: Array<typeof paperTradesTable.$inferSelect>) {
  const wins = trades.filter((trade) => trade.result === "WIN").length;

  return {
    closedTradeCount: trades.length,
    winRate: trades.length > 0 ? wins / trades.length : 0,
    averagePnl: averageNumber(trades.map((trade) => Number(trade.pnl ?? 0))),
    averageScore: averageNumber(trades.map((trade) => Number(trade.signalScore))),
    averageDurationMinutes: averageNumber(trades.map((trade) => Number(trade.holdingDurationMinutes))),
  };
}

function summarizeSymbols(trades: Array<typeof paperTradesTable.$inferSelect>) {
  const bySymbol = new Map<string, {
    symbol: string;
    direction: string;
    totalPnl: number;
    totalScore: number;
    totalDuration: number;
    count: number;
    wins: number;
    durationCount: number;
  }>();

  for (const trade of trades) {
    const key = `${trade.direction}:${trade.symbol}`;
    const current = bySymbol.get(key) ?? {
      symbol: trade.symbol,
      direction: trade.direction,
      totalPnl: 0,
      totalScore: 0,
      totalDuration: 0,
      count: 0,
      wins: 0,
      durationCount: 0,
    };

    const duration = Number(trade.holdingDurationMinutes);
    current.totalPnl += Number(trade.pnl ?? 0);
    current.totalScore += Number(trade.signalScore);
    current.count += 1;
    current.wins += trade.result === "WIN" ? 1 : 0;
    if (Number.isFinite(duration)) {
      current.totalDuration += duration;
      current.durationCount += 1;
    }
    bySymbol.set(key, current);
  }

  return [...bySymbol.values()]
    .map((item) => ({
      symbol: item.symbol,
      direction: item.direction,
      totalPnl: item.totalPnl,
      averagePnl: item.count > 0 ? item.totalPnl / item.count : 0,
      averageScore: item.count > 0 ? item.totalScore / item.count : 0,
      averageDurationMinutes: item.durationCount > 0 ? item.totalDuration / item.durationCount : 0,
      winRate: item.count > 0 ? item.wins / item.count : 0,
      count: item.count,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl);
}

function averageNumber(values: number[]): number {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) return 0;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function formatTrade(t: any) {
  return {
    id: t.id,
    tradeId: t.tradeId,
    symbol: t.symbol,
    direction: t.direction,
    source: t.source ?? "TECHNICAL",
    scannerType: t.scannerType ?? "TECHNICAL_SCANNER",
    strategyType: t.strategyType ?? "TECHNICAL",
    strategyLabel: t.strategyLabel,
    badge: t.badge,
    smcScore: t.smcScore ? Number(t.smcScore) : null,
    smcDetails: t.smcDetails ?? null,
    entryPrice: Number(t.entryPrice),
    stopLoss: Number(t.stopLoss),
    currentSl: t.currentSl ? Number(t.currentSl) : null,
    tp1: Number(t.tp1),
    tp2: Number(t.tp2),
    tp3: Number(t.tp3),
    quantity: Number(t.quantity),
    signalScore: Number(t.signalScore),
    signalGrade: t.signalGrade,
    reason: t.reason,
    slReason: t.slReason,
    status: t.status,
    result: t.result,
    tp1Hit: t.tp1Hit,
    tp2Hit: t.tp2Hit,
    tp3Hit: t.tp3Hit,
    exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
    exitReason: t.exitReason,
    pnl: t.pnl ? Number(t.pnl) : null,
    pnlPercent: t.pnlPercent ? Number(t.pnlPercent) : null,
    holdingDurationMinutes: t.holdingDurationMinutes,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
  };
}

function formatDaily(d: any) {
  return {
    date: d.date,
    trades: d.trades,
    wins: d.wins,
    losses: d.losses,
    pnl: Number(d.pnl),
    winRate: Number(d.winRate),
  };
}

function formatSetupStat(s: any) {
  return {
    setupType: s.setupType,
    direction: s.direction,
    totalTrades: s.totalTrades,
    wins: s.wins,
    losses: s.losses,
    winRate: Number(s.winRate),
    avgPnl: Number(s.avgPnl),
    avgScore: Number(s.avgScore),
    ranking: s.ranking,
  };
}

export default router;
