import assert from "node:assert/strict";
import test from "node:test";
import { StrategySelector } from "./StrategySelector";

test("StrategySelector returns configured strategy by regime", () => {
  const selector = new StrategySelector();
  assert.equal(selector.select("TRENDING_BULL"), "Breakout / Pullback");
  assert.equal(selector.select("TRENDING_BEAR"), "Breakdown / Pullback");
  assert.equal(selector.select("SIDEWAYS"), "Mean Reversion");
});
