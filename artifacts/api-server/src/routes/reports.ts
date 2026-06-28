import { Router } from "express";
import { db } from "@workspace/db";
import { paperTradesTable, signalsTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";

const router = Router();

router.get("/daily", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const trades = await db
    .select()
    .from(paperTradesTable)
    .where(and(eq(paperTradesTable.status, "closed"), gte(paperTradesTable.closedAt, today), lte(paperTradesTable.closedAt, tomorrow)));

  const totalTrades = trades.length;
  const wins = trades.filter(t => t.result === "WIN").length;
  const losses = trades.filter(t => t.result === "LOSS").length;
  const pnl = trades.reduce((acc, t) => acc + (t.pnl ? Number(t.pnl) : 0), 0);
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;

  const bestTrade = trades.sort((a, b) => Number(b.pnl ?? 0) - Number(a.pnl ?? 0))[0];

  const topSignals = await db
    .select({ symbol: signalsTable.symbol, score: signalsTable.score, direction: signalsTable.direction })
    .from(signalsTable)
    .where(gte(signalsTable.createdAt, today))
    .orderBy(desc(signalsTable.score))
    .limit(5);

  let summary = `Today: ${totalTrades} trades executed. `;
  if (totalTrades === 0) {
    summary += "No A/A+ setups qualified — no trades taken. Quality over quantity.";
  } else {
    summary += `Win rate: ${(winRate * 100).toFixed(1)}%. Total PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT.`;
    if (wins > losses) {
      summary += " Positive session — setups are performing well.";
    } else if (losses > wins) {
      summary += " Challenging session — review setups for improvement.";
    }
  }

  res.json({
    date: today.toISOString().slice(0, 10),
    totalTrades,
    wins,
    losses,
    pnl,
    winRate,
    summary,
    bestTrade: bestTrade ? bestTrade.tradeId : null,
    topSignals: topSignals.map(s => `${s.symbol} ${s.direction} (Score: ${Number(s.score).toFixed(0)})`),
  });
});

router.get("/weekly", async (req, res) => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const trades = await db
    .select()
    .from(paperTradesTable)
    .where(and(eq(paperTradesTable.status, "closed"), gte(paperTradesTable.closedAt, weekStart), lte(paperTradesTable.closedAt, weekEnd)));

  const totalTrades = trades.length;
  const wins = trades.filter(t => t.result === "WIN").length;
  const losses = trades.filter(t => t.result === "LOSS").length;
  const pnl = trades.reduce((acc, t) => acc + (t.pnl ? Number(t.pnl) : 0), 0);
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;

  const improvements: string[] = [];
  if (winRate >= 0.7) improvements.push("Excellent win rate above 70% — maintain current setup quality standards.");
  else if (winRate >= 0.5) improvements.push("Win rate above 50% — focus on improving entry timing and retest quality.");
  else if (totalTrades > 0) improvements.push("Win rate below 50% — tighten signal score threshold, consider only A+ setups.");
  if (totalTrades === 0) improvements.push("No trades taken this week — waiting for A/A+ setups is correct strategy.");
  improvements.push("Review best performing setups and identify common patterns for next week.");

  const summary = totalTrades === 0
    ? "No trades executed this week. Scanner is scanning for A/A+ quality setups only."
    : `Week summary: ${totalTrades} trades, ${wins} wins, ${losses} losses. Win rate: ${(winRate * 100).toFixed(1)}%. Net PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT.`;

  res.json({
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    totalTrades,
    wins,
    losses,
    pnl,
    winRate,
    summary,
    improvements,
  });
});

export default router;
