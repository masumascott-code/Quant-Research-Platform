import assert from "node:assert/strict";
import test from "node:test";
import { StrategyEvaluator } from "./StrategyEvaluator";
import type { PerformanceMetrics } from "./types";

test("StrategyEvaluator grades positive expectancy strategies above weak ones", () => {
  const base: PerformanceMetrics = {
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    maxDrawdown: 0,
    averageHoldMinutes: 0,
    averageRMultiple: 0,
    averageRisk: 0,
    totalReturn: 0,
    tradeCount: 10,
    equityCurve: [],
  };
  const evaluator = new StrategyEvaluator();
  const strong = evaluator.evaluate({ ...base, winRate: 0.65, profitFactor: 2, expectancy: 12, sharpeRatio: 1.5, calmarRatio: 1.2, averageRMultiple: 1.4 });
  const weak = evaluator.evaluate({ ...base, winRate: 0.25, profitFactor: 0.7, expectancy: -4, sharpeRatio: -0.5, maxDrawdown: 0.35, averageRMultiple: -0.4 });

  assert.ok(strong.score > weak.score);
  assert.ok(strong.reasons.includes("Positive expectancy"));
});
