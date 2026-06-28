import assert from "node:assert/strict";
import test from "node:test";
import { WalkForwardEngine } from "./WalkForwardEngine";
import type { HistoricalDataset, ResearchStrategy } from "./types";

function dataset(): HistoricalDataset {
  return {
    symbol: "ETHUSDT",
    exchange: "BINANCE",
    timeframe: "1h",
    bars: Array.from({ length: 8 }).map((_, index) => ({
      symbol: "ETHUSDT",
      timeframe: "1h",
      timestamp: new Date(Date.UTC(2026, 0, 1, index)),
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100 + index,
      volume: 1000 + index,
    })),
  };
}

test("WalkForwardEngine builds rolling training and validation windows", async () => {
  const strategy: ResearchStrategy = {
    id: "wf-hold",
    version: "1.0.0",
    name: "WF Hold",
    onBar() {
      return { type: "HOLD" };
    },
  };
  const engine = new WalkForwardEngine();
  const windows = engine.createWindows(dataset(), 3, 2, 2);

  assert.equal(windows.length, 2);

  const result = await engine.run({
    strategy,
    dataset: dataset(),
    candidates: [{ name: "base", parameters: { threshold: 1 } }],
    initialEquity: 1_000,
    trainingWindowBars: 3,
    validationWindowBars: 2,
    stepBars: 2,
  });

  assert.equal(result.windows.length, 2);
  assert.equal(result.windows[0]?.selected.name, "base");
});
