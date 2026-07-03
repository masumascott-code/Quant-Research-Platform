import { Router } from "express";
import { db } from "@workspace/db";
import { paperTradesTable, scannerDecisionsTable, signalsTable } from "@workspace/db";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";

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

  const tradeDetails = await Promise.all(trades.map((trade) => buildTradeDetail(trade)));

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
    trades: tradeDetails,
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

async function buildTradeDetail(trade: typeof paperTradesTable.$inferSelect) {
  const openedAt = new Date(trade.openedAt);
  const closedAt = trade.closedAt ? new Date(trade.closedAt) : new Date();
  const scoreTrail = await db
    .select({
      score: scannerDecisionsTable.finalScore,
      decision: scannerDecisionsTable.decision,
      strategy: scannerDecisionsTable.strategy,
      createdAt: scannerDecisionsTable.createdAt,
    })
    .from(scannerDecisionsTable)
    .where(and(
      eq(scannerDecisionsTable.symbol, trade.symbol),
      eq(scannerDecisionsTable.direction, trade.direction),
      gte(scannerDecisionsTable.createdAt, openedAt),
      lte(scannerDecisionsTable.createdAt, closedAt),
    ))
    .orderBy(asc(scannerDecisionsTable.createdAt))
    .limit(500);

  const entryScore = Number(trade.signalScore);
  const observedScores = scoreTrail
    .map((row) => Number(row.score))
    .filter((value) => Number.isFinite(value));
  const scoreValues = observedScores.length > 0 ? [entryScore, ...observedScores] : [entryScore];
  const scoreRange = {
    entry: entryScore,
    min: Math.min(...scoreValues),
    max: Math.max(...scoreValues),
    latest: scoreValues.at(-1) ?? entryScore,
    samples: observedScores.length,
    trackedAfterEntry: observedScores.length > 0,
  };

  const target = highestTargetHit(trade);
  const maxProfitPercent = resolveMaxProfitPercent(trade);
  const maxDrawdownPercent = trade.maxDrawdown == null ? null : Number(trade.maxDrawdown);
  const pnlPercent = trade.pnlPercent == null ? null : Number(trade.pnlPercent);
  const gaveBackProfitPercent = maxProfitPercent == null || pnlPercent == null
    ? null
    : Math.max(0, maxProfitPercent - pnlPercent);
  const tp1Reached = trade.tp1Hit || trade.tp2Hit || trade.tp3Hit;
  const slMovedAfterTp1 = tp1Reached && trade.currentSl != null && Number(trade.currentSl) !== Number(trade.stopLoss);
  const stopClosed = /stop/i.test(trade.exitReason ?? "");
  const telegramOutcome = stopClosed && tp1Reached
    ? trade.result === "LOSS"
      ? "Legacy record: this closed as LOSS before protected-stop fix."
      : `Protected stop: Telegram closes as ${trade.result ?? "BREAKEVEN"}, not LOSS.`
    : trade.result === "LOSS"
      ? "Loss close notice."
      : trade.result === "WIN"
        ? "Win close notice."
        : trade.result === "BREAKEVEN"
          ? "Break-even close notice."
          : "Close notice pending.";

  return {
    id: trade.id,
    tradeId: trade.tradeId,
    symbol: trade.symbol,
    direction: trade.direction,
    setupType: trade.setupType,
    signalGrade: trade.signalGrade,
    entryPrice: Number(trade.entryPrice),
    stopLoss: Number(trade.stopLoss),
    currentSl: trade.currentSl == null ? null : Number(trade.currentSl),
    tp1: Number(trade.tp1),
    tp2: Number(trade.tp2),
    tp3: Number(trade.tp3),
    exitPrice: trade.exitPrice == null ? null : Number(trade.exitPrice),
    exitReason: trade.exitReason,
    result: trade.result,
    pnl: trade.pnl == null ? null : Number(trade.pnl),
    pnlPercent,
    maxProfitPercent,
    maxProfitSource: trade.maxProfit == null ? "inferred_from_targets" : "tracked_from_price_ticks",
    maxDrawdownPercent,
    gaveBackProfitPercent,
    wentProfitToLoss: (maxProfitPercent ?? 0) > 0 && (pnlPercent ?? 0) < 0,
    scoreRange,
    scoreTrail: scoreTrail.slice(-20).map((row) => ({
      score: Number(row.score),
      decision: row.decision,
      strategy: row.strategy,
      createdAt: row.createdAt,
    })),
    targets: {
      highestHit: target,
      tp1Hit: trade.tp1Hit || trade.tp2Hit || trade.tp3Hit,
      tp2Hit: trade.tp2Hit || trade.tp3Hit,
      tp3Hit: trade.tp3Hit,
    },
    stopManagement: {
      movedAfterTp1: slMovedAfterTp1,
      movedTo: trade.currentSl == null ? null : Number(trade.currentSl),
      expectedAfterTp1: Number(trade.entryPrice),
      note: slMovedAfterTp1
        ? trade.tp2Hit
          ? "SL trailed to TP1 after TP2."
          : "SL moved to entry/break-even after TP1."
        : tp1Reached
          ? "TP was reached, but stored SL movement is not visible on this record."
          : "TP1 not reached, original SL remained active.",
    },
    telegramOutcome,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    holdingDurationMinutes: trade.holdingDurationMinutes,
  };
}

function highestTargetHit(trade: typeof paperTradesTable.$inferSelect): "TP3" | "TP2" | "TP1" | "None" {
  if (trade.tp3Hit) return "TP3";
  if (trade.tp2Hit) return "TP2";
  if (trade.tp1Hit) return "TP1";
  return "None";
}

function resolveMaxProfitPercent(trade: typeof paperTradesTable.$inferSelect): number | null {
  if (trade.maxProfit != null) return Number(trade.maxProfit);

  const entry = Number(trade.entryPrice);
  if (!Number.isFinite(entry) || entry <= 0) return null;

  const targetPrice = trade.tp3Hit ? Number(trade.tp3)
    : trade.tp2Hit ? Number(trade.tp2)
      : trade.tp1Hit ? Number(trade.tp1)
        : null;
  if (targetPrice == null) return null;

  return trade.direction === "LONG"
    ? ((targetPrice - entry) / entry) * 100
    : ((entry - targetPrice) / entry) * 100;
}
