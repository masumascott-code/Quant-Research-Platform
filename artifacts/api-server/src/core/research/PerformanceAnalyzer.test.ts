import assert from "node:assert/strict";
import test from "node:test";
import { PerformanceAnalyzer } from "./PerformanceAnalyzer";
import type { ResearchTrade } from "./types";

function trade(pnl: number, index: number): ResearchTrade {
  return {
    symbol: "BTCUSDT",
    direction: "LONG",
    entryAt: new Date(`2026-01-0${index + 1}T00:00:00Z`),
    exitAt: new Date(`2026-01-0${index + 1}T01:00:00Z`),
    entryPrice: 100,
    exitPrice: 100 + pnl,
    quantity: 1,
    pnl,
    pnlPercent: pnl,
    rMultiple: pnl / 10,
    riskAmount: 10,
    holdMinutes: 60,
    fees: 0,
  };
}

test("PerformanceAnalyzer calculates institutional metrics from closed trades", () => {
  const metrics = new PerformanceAnalyzer().analyze([trade(20, 0), trade(-10, 1), trade(30, 2)], 1_000);

  assert.equal(metrics.tradeCount, 3);
  assert.equal(metrics.winRate, 2 / 3);
  assert.equal(metrics.profitFactor, 5);
  assert.equal(metrics.expectancy, 40 / 3);
  assert.equal(metrics.averageHoldMinutes, 60);
  assert.equal(metrics.averageRisk, 10);
  assert.ok(metrics.maxDrawdown >= 0);
});
