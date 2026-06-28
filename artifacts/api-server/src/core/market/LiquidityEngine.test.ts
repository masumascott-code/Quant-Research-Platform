import assert from "node:assert/strict";
import test from "node:test";
import { LiquidityEngine } from "./LiquidityEngine";
import type { MarketCandle } from "./types";

test("LiquidityEngine detects sweep and false breakout conditions", () => {
  const candles: MarketCandle[] = Array.from({ length: 12 }, (_, index) => ({
    timestamp: index,
    open: 100,
    high: 105,
    low: 95,
    close: 100,
    volume: 1000,
  }));
  candles[candles.length - 2] = { timestamp: 10, open: 100, high: 105, low: 95, close: 102, volume: 1000 };
  candles[candles.length - 1] = { timestamp: 11, open: 103, high: 108, low: 96, close: 101, volume: 1500 };

  const result = new LiquidityEngine().analyze(candles);
  assert.equal(result.liquiditySweep, true);
  assert.equal(result.stopHunt, true);
  assert.ok(result.score > 0);
});
