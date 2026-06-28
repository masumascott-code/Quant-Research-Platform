import assert from "node:assert/strict";
import test from "node:test";
import { MarketRegimeDetector } from "./MarketRegimeDetector";
import type { MarketCandle } from "./types";

function candles(up = true): MarketCandle[] {
  return Array.from({ length: 80 }, (_, index) => {
    const base = up ? 100 + index : 180 - index;
    return {
      timestamp: index,
      open: base,
      high: base + 2,
      low: base - 1,
      close: base + (up ? 1 : -1),
      volume: 1000 + index,
    };
  });
}

test("MarketRegimeDetector detects bullish trending markets", () => {
  const result = new MarketRegimeDetector().detect(candles(true));
  assert.equal(result.regime, "TRENDING_BULL");
  assert.ok(result.confidence > 0);
});

test("MarketRegimeDetector detects bearish trending markets", () => {
  const result = new MarketRegimeDetector().detect(candles(false));
  assert.equal(result.regime, "TRENDING_BEAR");
  assert.ok(result.confidence > 0);
});
