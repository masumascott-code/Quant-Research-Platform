import { Router } from "express";
import { db } from "@workspace/db";
import { paperTradesTable, dailyPerformanceTable, setupStatisticsTable } from "@workspace/db";
import { eq, desc, and, gte, sql, count, sum, avg } from "drizzle-orm";

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
  const perf = await getPerformance();
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

async function getPerformance() {
  const allClosed = await db
    .select({
      total: count(),
      totalPnl: sum(paperTradesTable.pnl),
      avgPnl: avg(paperTradesTable.pnl),
      avgScore: avg(paperTradesTable.signalScore),
      avgHolding: avg(paperTradesTable.holdingDurationMinutes),
    })
    .from(paperTradesTable)
    .where(eq(paperTradesTable.status, "closed"));

  const wins = await db.select({ count: count(), avgPnl: avg(paperTradesTable.pnl) }).from(paperTradesTable).where(and(eq(paperTradesTable.status, "closed"), eq(paperTradesTable.result, "WIN")));
  const losses = await db.select({ count: count(), avgPnl: avg(paperTradesTable.pnl) }).from(paperTradesTable).where(and(eq(paperTradesTable.status, "closed"), eq(paperTradesTable.result, "LOSS")));
  const breakevens = await db.select({ count: count() }).from(paperTradesTable).where(and(eq(paperTradesTable.status, "closed"), eq(paperTradesTable.result, "BREAKEVEN")));

  const bestTrade = await db.select().from(paperTradesTable).where(eq(paperTradesTable.status, "closed")).orderBy(desc(paperTradesTable.pnl)).limit(1);
  const worstTrade = await db.select().from(paperTradesTable).where(eq(paperTradesTable.status, "closed")).orderBy(sql`pnl::numeric ASC`).limit(1);

  const totalTrades = Number(allClosed[0]?.total ?? 0);
  const winCount = Number(wins[0]?.count ?? 0);
  const lossCount = Number(losses[0]?.count ?? 0);
  const breakevenCount = Number(breakevens[0]?.count ?? 0);
  const totalPnl = Number(allClosed[0]?.totalPnl ?? 0);
  const avgWin = Number(wins[0]?.avgPnl ?? 0);
  const avgLoss = Math.abs(Number(losses[0]?.avgPnl ?? 0));
  const profitFactor = avgLoss > 0 ? (avgWin * winCount) / (avgLoss * lossCount) : 0;

  return {
    totalTrades,
    wins: winCount,
    losses: lossCount,
    breakevens: breakevenCount,
    winRate: totalTrades > 0 ? winCount / totalTrades : 0,
    totalPnl,
    avgPnl: Number(allClosed[0]?.avgPnl ?? 0),
    avgWin,
    avgLoss: losses[0]?.avgPnl ? Number(losses[0].avgPnl) : 0,
    profitFactor: isFinite(profitFactor) ? profitFactor : 0,
    maxDrawdown: 0,
    avgHoldingMinutes: Number(allClosed[0]?.avgHolding ?? 0),
    avgScore: Number(allClosed[0]?.avgScore ?? 0),
    bestTrade: bestTrade[0] ? formatTrade(bestTrade[0]) : null,
    worstTrade: worstTrade[0] ? formatTrade(worstTrade[0]) : null,
  };
}

function formatTrade(t: any) {
  return {
    id: t.id,
    tradeId: t.tradeId,
    symbol: t.symbol,
    direction: t.direction,
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
