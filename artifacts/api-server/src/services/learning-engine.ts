import { db } from "@workspace/db";
import { tradeReviewsTable, setupStatisticsTable, paperTradesTable, dailyPerformanceTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { Telegram } from "./telegram";

export async function reviewClosedTrade(tradeId: number): Promise<void> {
  const [trade] = await db.select().from(paperTradesTable).where(eq(paperTradesTable.id, tradeId));
  if (!trade || trade.status !== "closed") return;

  const pnl = Number(trade.pnl ?? 0);
  const score = Number(trade.signalScore);
  const result = trade.result ?? "LOSS";

  // Analyze why the trade won or lost
  let analysisReason = "";
  let lessonsLearned = "";
  let improvementNotes = "";
  let setupQuality: string;
  let winningFactors = "";
  let losingFactors = "";

  if (result === "WIN") {
    analysisReason = `Trade won ${trade.tradeId} on ${trade.symbol} (${trade.direction}). ` +
      `Entry ${Number(trade.entryPrice).toFixed(4)} → Exit ${Number(trade.exitPrice ?? 0).toFixed(4)}. ` +
      `Signal score was ${score.toFixed(1)}/100. PnL: +${pnl.toFixed(4)} USDT. ` +
      `Exit: ${trade.exitReason}. Duration: ${trade.holdingDurationMinutes}min.`;

    if (score >= 95) {
      setupQuality = "excellent";
      winningFactors = "A+ signal quality, all 5 scoring factors aligned perfectly";
      lessonsLearned = `A+ setup on ${trade.symbol} delivered strong results. High score setups (95+) continue to outperform. Maintain strict score filter.`;
    } else {
      setupQuality = "good";
      winningFactors = "A signal quality, most factors aligned";
      lessonsLearned = `A-grade setup on ${trade.symbol} succeeded. Score ${score.toFixed(1)} was sufficient for a winning trade.`;
    }

    if (trade.tp2Hit) {
      improvementNotes = "Trade reached TP2+ — excellent execution. Trailing stop after TP1 worked as designed.";
    } else if (trade.tp1Hit) {
      improvementNotes = "Trade reached TP1 — partial success. Consider holding longer if structure remains intact.";
    }
  } else if (result === "LOSS") {
    analysisReason = `Trade lost ${trade.tradeId} on ${trade.symbol} (${trade.direction}). ` +
      `Entry ${Number(trade.entryPrice).toFixed(4)} → Exit ${Number(trade.exitPrice ?? 0).toFixed(4)}. ` +
      `Signal score was ${score.toFixed(1)}/100. PnL: ${pnl.toFixed(4)} USDT. ` +
      `SL hit. Duration: ${trade.holdingDurationMinutes}min.`;

    if (score >= 95) {
      setupQuality = "good";
      losingFactors = "Even A+ setups fail sometimes — market conditions shifted post-entry";
      lessonsLearned = `A+ setup on ${trade.symbol} still lost. Market can invalidate any setup. Dynamic SL and proper position sizing are critical.`;
      improvementNotes = `Review if market context changed (BTC dominance, news event) around entry time. Score alone doesn't guarantee wins.`;
    } else {
      setupQuality = "average";
      losingFactors = "Setup at lower end of acceptable score range";
      lessonsLearned = `${trade.symbol} loss with score ${score.toFixed(1)}. Consider if 90-94 range setups need additional confirmation before entry.`;
      improvementNotes = `Evaluate if minimum threshold should be raised to 92+ for ${trade.direction} setups in current market conditions.`;
    }
  } else {
    analysisReason = `Breakeven trade ${trade.tradeId} on ${trade.symbol}. SL moved to break-even after TP1, then reversed.`;
    setupQuality = "average";
    lessonsLearned = `Breakeven is a managed outcome — capital preserved. Consider slightly wider trail after TP1 for ${trade.symbol} type coins.`;
  }

  // Check if a review already exists
  const existing = await db.select({ id: tradeReviewsTable.id }).from(tradeReviewsTable).where(eq(tradeReviewsTable.tradeId, trade.tradeId));
  if (existing.length === 0) {
    await db.insert(tradeReviewsTable).values({
      paperTradeId: trade.id,
      tradeId: trade.tradeId,
      symbol: trade.symbol,
      direction: trade.direction,
      result,
      analysisReason,
      lessonsLearned,
      improvementNotes,
      setupQuality,
      winningFactors: winningFactors || null,
      losingFactors: losingFactors || null,
    });
  }

  // Update setup statistics
  await updateSetupStats(trade.direction, result, pnl, score);

  // Update daily performance
  await updateDailyPerformance();

  logger.info({ tradeId: trade.tradeId, result, pnl }, "Learning engine processed trade");
}

async function updateSetupStats(direction: string, result: string, pnl: number, score: number): Promise<void> {
  const setupType = direction === "LONG" ? "breakout_retest_long" : "breakdown_retest_short";

  const [existing] = await db.select().from(setupStatisticsTable)
    .where(and(eq(setupStatisticsTable.setupType, setupType), eq(setupStatisticsTable.direction, direction)));

  if (existing) {
    const newTotal = existing.totalTrades + 1;
    const newWins = existing.wins + (result === "WIN" ? 1 : 0);
    const newLosses = existing.losses + (result === "LOSS" ? 1 : 0);
    const newBreakevens = existing.breakevens + (result === "BREAKEVEN" ? 1 : 0);
    const newAvgPnl = ((Number(existing.avgPnl) * existing.totalTrades) + pnl) / newTotal;
    const newAvgScore = ((Number(existing.avgScore) * existing.totalTrades) + score) / newTotal;

    await db.update(setupStatisticsTable).set({
      totalTrades: newTotal,
      wins: newWins,
      losses: newLosses,
      breakevens: newBreakevens,
      winRate: String(newTotal > 0 ? newWins / newTotal : 0),
      avgPnl: String(newAvgPnl),
      avgScore: String(newAvgScore),
      updatedAt: new Date(),
    }).where(eq(setupStatisticsTable.id, existing.id));
  } else {
    await db.insert(setupStatisticsTable).values({
      setupType,
      direction,
      totalTrades: 1,
      wins: result === "WIN" ? 1 : 0,
      losses: result === "LOSS" ? 1 : 0,
      breakevens: result === "BREAKEVEN" ? 1 : 0,
      winRate: String(result === "WIN" ? 1 : 0),
      avgPnl: String(pnl),
      avgScore: String(score),
    });
  }
}

async function updateDailyPerformance(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const todayTrades = await db.select().from(paperTradesTable)
    .where(and(eq(paperTradesTable.status, "closed"), sql`closed_at::date = ${today}::date`));

  const trades = todayTrades.length;
  const wins = todayTrades.filter(t => t.result === "WIN").length;
  const losses = todayTrades.filter(t => t.result === "LOSS").length;
  const breakevens = todayTrades.filter(t => t.result === "BREAKEVEN").length;
  const pnl = todayTrades.reduce((acc, t) => acc + Number(t.pnl ?? 0), 0);
  const winRate = trades > 0 ? wins / trades : 0;
  const avgScore = trades > 0 ? todayTrades.reduce((acc, t) => acc + Number(t.signalScore), 0) / trades : 0;

  const [existing] = await db.select().from(dailyPerformanceTable).where(sql`date = ${today}::date`);

  if (existing) {
    await db.update(dailyPerformanceTable).set({
      trades, wins, losses, breakevens,
      pnl: String(pnl),
      winRate: String(winRate),
      avgScore: String(avgScore),
      updatedAt: new Date(),
    }).where(eq(dailyPerformanceTable.id, existing.id));
  } else {
    await db.insert(dailyPerformanceTable).values({
      date: today,
      trades, wins, losses, breakevens,
      pnl: String(pnl),
      winRate: String(winRate),
      avgScore: String(avgScore),
    });
  }
}

export async function runLearningReport(): Promise<void> {
  try {
    const totalReviews = await db.select({ c: count() }).from(tradeReviewsTable);
    const bestSetups = await db.select({ symbol: tradeReviewsTable.symbol, direction: tradeReviewsTable.direction })
      .from(tradeReviewsTable)
      .where(and(eq(tradeReviewsTable.result, "WIN"), eq(tradeReviewsTable.setupQuality, "excellent")))
      .limit(3);
    const worstSetups = await db.select({ symbol: tradeReviewsTable.symbol, direction: tradeReviewsTable.direction })
      .from(tradeReviewsTable)
      .where(and(eq(tradeReviewsTable.result, "LOSS"), eq(tradeReviewsTable.setupQuality, "poor")))
      .limit(3);
    const notes = await db.select({ notes: tradeReviewsTable.improvementNotes })
      .from(tradeReviewsTable)
      .where(sql`improvement_notes IS NOT NULL`)
      .orderBy(desc(tradeReviewsTable.createdAt))
      .limit(3);

    await Telegram.learningReport({
      totalReviews: Number(totalReviews[0]?.c ?? 0),
      bestSetups: bestSetups.map(r => `${r.symbol} ${r.direction}`),
      worstSetups: worstSetups.map(r => `${r.symbol} ${r.direction}`),
      improvementNotes: notes.map(r => r.notes).filter(Boolean) as string[],
    });
  } catch (err) {
    logger.error({ err }, "Failed to send learning report");
  }
}
