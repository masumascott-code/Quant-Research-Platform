import test from "node:test";
import assert from "node:assert/strict";
import { AdaptiveLearningEngine } from "./AdaptiveLearningEngine";
import { MistakeAnalyzer } from "./MistakeAnalyzer";
import { StrategyOptimizer } from "./StrategyOptimizer";
import type { LearningDataset } from "./types";

test("MistakeAnalyzer detects repeated mistakes and high-risk behaviour", () => {
  const analysis = new MistakeAnalyzer().analyze(sampleDataset());

  assert.ok(analysis.repeatedMistakes.some((pattern) => pattern.key === "borderline_score"));
  assert.ok(analysis.highRiskBehaviours.some((pattern) => pattern.key === "low_score_losses"));
  assert.ok(analysis.traderDisciplineScore < 100);
});

test("StrategyOptimizer separates strong and weak strategies", () => {
  const optimization = new StrategyOptimizer().optimize(sampleDataset());

  assert.equal(optimization.preferredStrategy?.strategy, "breakout_retest_long");
  assert.equal(optimization.avoidedStrategy?.strategy, "breakdown_retest_short");
  assert.ok(optimization.consistencyScore >= 0);
});

test("AdaptiveLearningEngine produces advisory recommendations without persistence", async () => {
  const repository = {
    loadDataset: async () => sampleDataset(),
    persistResult: async () => {
      throw new Error("persistResult should not be called when persist=false");
    },
    improvementTimeline: async () => [],
    acceptanceStats: async () => ({ accepted: 0, rejected: 0, pending: 0 }),
  };
  const result = await new AdaptiveLearningEngine(repository as any).run({ lookbackDays: 30, persist: false });

  assert.equal(result.advisoryOnly, true);
  assert.equal(result.persisted, false);
  assert.ok(result.scores.edgeScore >= 0);
  assert.ok(result.recommendations.length >= 5);
  assert.ok(result.recommendations.every((recommendation) =>
    recommendation.status === "PENDING_HUMAN_APPROVAL" &&
    recommendation.requiresHumanApproval === true,
  ));
});

function sampleDataset(): LearningDataset {
  const now = new Date("2026-06-29T00:00:00.000Z");
  return {
    generatedAt: now.toISOString(),
    lookbackDays: 30,
    trades: [
      {
        tradeId: "T-1",
        symbol: "BTCUSDT",
        direction: "LONG",
        setupType: "breakout_retest_long",
        status: "closed",
        result: "WIN",
        signalScore: 97,
        pnl: 120,
        pnlPercent: 2.4,
        maxDrawdown: 0.8,
        openedAt: new Date("2026-06-28T02:00:00.000Z"),
      },
      {
        tradeId: "T-2",
        symbol: "ETHUSDT",
        direction: "SHORT",
        setupType: "breakdown_retest_short",
        status: "closed",
        result: "LOSS",
        signalScore: 90,
        pnl: -50,
        pnlPercent: -2.1,
        maxDrawdown: 3.2,
        openedAt: new Date("2026-06-28T14:00:00.000Z"),
      },
      {
        tradeId: "T-3",
        symbol: "SOLUSDT",
        direction: "SHORT",
        setupType: "breakdown_retest_short",
        status: "closed",
        result: "LOSS",
        signalScore: 91,
        pnl: -45,
        pnlPercent: -2.3,
        maxDrawdown: 3.5,
        openedAt: new Date("2026-06-27T15:00:00.000Z"),
      },
    ],
    tradeReviews: [
      {
        tradeId: "T-2",
        symbol: "ETHUSDT",
        direction: "SHORT",
        result: "LOSS",
        setupQuality: "average",
        analysisReason: "Loss from lower end score setup.",
        lessonsLearned: "Consider if 90-94 range setups need confirmation.",
        improvementNotes: "Evaluate if minimum threshold should be raised to 92+.",
        losingFactors: "Setup at lower end of acceptable score range",
        createdAt: now,
      },
      {
        tradeId: "T-3",
        symbol: "SOLUSDT",
        direction: "SHORT",
        result: "LOSS",
        setupQuality: "average",
        analysisReason: "Loss from lower end score setup.",
        lessonsLearned: "Consider if 90-94 range setups need confirmation.",
        improvementNotes: "Evaluate if minimum threshold should be raised to 92+.",
        losingFactors: "Setup at lower end of acceptable score range",
        createdAt: now,
      },
    ],
    setupStats: [
      {
        setupType: "breakout_retest_long",
        direction: "LONG",
        totalTrades: 8,
        wins: 6,
        losses: 2,
        breakevens: 0,
        winRate: 0.75,
        avgPnl: 35,
        avgScore: 96,
        ranking: 1,
      },
      {
        setupType: "breakdown_retest_short",
        direction: "SHORT",
        totalTrades: 8,
        wins: 2,
        losses: 6,
        breakevens: 0,
        winRate: 0.25,
        avgPnl: -22,
        avgScore: 91,
        ranking: 2,
      },
    ],
    performanceMetrics: [{
      scope: "BACKTEST",
      winRate: 0.58,
      profitFactor: 1.5,
      expectancy: 1.2,
      sharpeRatio: 1.1,
      maxDrawdown: 8,
      averageRisk: 1,
      totalReturn: 12,
      tradeCount: 40,
      createdAt: now,
    }],
    backtests: [{
      runId: "BT-1",
      status: "COMPLETED",
      symbol: "BTCUSDT",
      timeframe: "15m",
      marketRegime: "TRENDING",
      initialEquity: 10000,
      finalEquity: 11200,
      createdAt: now,
      completedAt: now,
    }],
    marketContexts: [{
      symbol: "BTCUSDT",
      marketRegime: "TRENDING",
      session: "ASIA",
      confidence: 82,
      liquidityScore: 76,
      trendScore: 84,
      volumeScore: 70,
      volatilityScore: 45,
      riskGrade: "MEDIUM",
      createdAt: now,
    }],
    executionMetrics: [{
      symbol: "BTCUSDT",
      status: "FILLED",
      entrySlippage: 0.001,
      exitSlippage: 0.001,
      executionDelayMs: 300,
      fillRatio: 1,
      createdAt: now,
    }],
    portfolioMetrics: [{
      totalEquity: 10000,
      freeEquity: 9000,
      openExposure: 1000,
      dailyPnl: 25,
      riskUsagePercent: 30,
      updatedAt: now,
    }],
  };
}
