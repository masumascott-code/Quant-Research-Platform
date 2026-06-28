import assert from "node:assert/strict";
import test from "node:test";
import { BacktestEngine } from "./BacktestEngine";
import type { HistoricalDataset, ResearchStrategy } from "./types";

function dataset(): HistoricalDataset {
  return {
    symbol: "BTCUSDT",
    exchange: "BINANCE",
    timeframe: "1h",
    bars: [
      { symbol: "BTCUSDT", timeframe: "1h", timestamp: new Date("2026-01-01T00:00:00Z"), open: 100, high: 105, low: 99, close: 104, volume: 1000 },
      { symbol: "BTCUSDT", timeframe: "1h", timestamp: new Date("2026-01-01T01:00:00Z"), open: 104, high: 106, low: 101, close: 102, volume: 1200 },
    ],
  };
}

test("BacktestEngine replays historical bars without persisting when requested", async () => {
  const strategy: ResearchStrategy = {
    id: "hold-only",
    version: "1.0.0",
    name: "Hold Only",
    onBar() {
      return { type: "HOLD" };
    },
  };

  const result = await new BacktestEngine().run({
    strategy,
    dataset: dataset(),
    initialEquity: 1_000,
    persistResults: false,
  });

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.metrics.tradeCount, 0);
  assert.match(result.runId, /^BT-hold-only-/);
});
