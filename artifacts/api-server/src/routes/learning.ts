import { Router } from "express";
import { db } from "@workspace/db";
import { tradeReviewsTable, paperTradesTable } from "@workspace/db";
import { eq, desc, and, avg, sql } from "drizzle-orm";

const router = Router();

router.get("/reviews", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const reviews = await db
    .select()
    .from(tradeReviewsTable)
    .orderBy(desc(tradeReviewsTable.createdAt))
    .limit(limit);

  res.json(reviews.map(r => ({
    id: r.id,
    tradeId: r.tradeId,
    symbol: r.symbol,
    direction: r.direction,
    result: r.result,
    analysisReason: r.analysisReason,
    lessonsLearned: r.lessonsLearned,
    improvementNotes: r.improvementNotes,
    setupQuality: r.setupQuality,
    createdAt: r.createdAt,
  })));
});

router.get("/insights", async (req, res) => {
  const totalReviews = await db
    .select({ count: sql<number>`count(*)` })
    .from(tradeReviewsTable);

  const winReviews = await db
    .select({ avgScore: avg(paperTradesTable.signalScore) })
    .from(tradeReviewsTable)
    .leftJoin(paperTradesTable, eq(tradeReviewsTable.tradeId, paperTradesTable.tradeId))
    .where(eq(tradeReviewsTable.result, "WIN"));

  const lossReviews = await db
    .select({ avgScore: avg(paperTradesTable.signalScore) })
    .from(tradeReviewsTable)
    .leftJoin(paperTradesTable, eq(tradeReviewsTable.tradeId, paperTradesTable.tradeId))
    .where(eq(tradeReviewsTable.result, "LOSS"));

  const excellentReviews = await db
    .select({ symbol: tradeReviewsTable.symbol, direction: tradeReviewsTable.direction })
    .from(tradeReviewsTable)
    .where(and(eq(tradeReviewsTable.result, "WIN"), eq(tradeReviewsTable.setupQuality, "excellent")))
    .limit(5);

  const poorReviews = await db
    .select({ symbol: tradeReviewsTable.symbol, direction: tradeReviewsTable.direction })
    .from(tradeReviewsTable)
    .where(and(eq(tradeReviewsTable.result, "LOSS"), eq(tradeReviewsTable.setupQuality, "poor")))
    .limit(5);

  const latestNotes = await db
    .select({ notes: tradeReviewsTable.improvementNotes })
    .from(tradeReviewsTable)
    .where(sql`improvement_notes IS NOT NULL`)
    .orderBy(desc(tradeReviewsTable.createdAt))
    .limit(10);

  const latestLessons = await db
    .select({ lessons: tradeReviewsTable.lessonsLearned })
    .from(tradeReviewsTable)
    .orderBy(desc(tradeReviewsTable.createdAt))
    .limit(5);

  res.json({
    totalReviews: Number(totalReviews[0]?.count ?? 0),
    bestSetups: excellentReviews.map(r => `${r.symbol} ${r.direction}`),
    worstSetups: poorReviews.map(r => `${r.symbol} ${r.direction}`),
    improvementNotes: latestNotes.map(r => r.notes).filter(Boolean) as string[],
    keyLessons: latestLessons.map(r => r.lessons),
    avgWinScore: winReviews[0]?.avgScore ? Number(winReviews[0].avgScore) : null,
    avgLossScore: lossReviews[0]?.avgScore ? Number(lossReviews[0].avgScore) : null,
  });
});

router.get("/rvol-analysis", async (req, res) => {
  const result = await db.execute(sql`
    SELECT
      CASE
        WHEN ms.rvol::numeric < 1.5 THEN '< 1.5'
        WHEN ms.rvol::numeric < 2.0 THEN '1.5 - 2.0'
        WHEN ms.rvol::numeric < 3.0 THEN '2.0 - 3.0'
        WHEN ms.rvol::numeric < 5.0 THEN '3.0 - 5.0'
        ELSE '> 5.0'
      END AS range_label,
      CASE
        WHEN ms.rvol::numeric < 1.5 THEN 0
        WHEN ms.rvol::numeric < 2.0 THEN 1.5
        WHEN ms.rvol::numeric < 3.0 THEN 2.0
        WHEN ms.rvol::numeric < 5.0 THEN 3.0
        ELSE 5.0
      END AS min_rvol,
      CASE
        WHEN ms.rvol::numeric < 1.5 THEN 1.5
        WHEN ms.rvol::numeric < 2.0 THEN 2.0
        WHEN ms.rvol::numeric < 3.0 THEN 3.0
        WHEN ms.rvol::numeric < 5.0 THEN 5.0
        ELSE 999
      END AS max_rvol,
      COUNT(*) AS trades,
      AVG(CASE WHEN pt.result = 'WIN' THEN 1.0 ELSE 0.0 END) AS win_rate,
      AVG(COALESCE(pt.pnl::numeric, 0)) AS avg_pnl
    FROM paper_trades pt
    JOIN signals s ON pt.signal_id = s.id
    JOIN market_snapshots ms ON ms.symbol = pt.symbol
      AND ms.scanned_at = (SELECT MAX(scanned_at) FROM market_snapshots WHERE symbol = pt.symbol)
    WHERE pt.status = 'closed'
    GROUP BY range_label, min_rvol, max_rvol
    ORDER BY min_rvol
  `);

  const rows = (result.rows as any[]).map((r: any) => ({
    rangeLabel: r.range_label,
    minRvol: Number(r.min_rvol),
    maxRvol: Number(r.max_rvol),
    trades: Number(r.trades),
    winRate: Number(r.win_rate),
    avgPnl: Number(r.avg_pnl),
  }));

  const bestRange = rows.length > 0
    ? rows.reduce((best, curr) => curr.winRate > best.winRate ? curr : best).rangeLabel
    : null;

  res.json({ ranges: rows, bestRange });
});

export default router;
