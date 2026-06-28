import assert from "node:assert/strict";
import test from "node:test";
import { SlippageEngine } from "./SlippageEngine";

test("SlippageEngine returns zero slippage without market pressure inputs", () => {
  const estimate = new SlippageEngine().estimate({
    referencePrice: 100,
    orderSize: 10,
    market: {},
  });

  assert.equal(estimate.entrySlippage, 0);
  assert.equal(estimate.exitSlippage, 0);
});

test("SlippageEngine increases slippage from spread, volatility, ATR, RVOL and size", () => {
  const estimate = new SlippageEngine().estimate({
    referencePrice: 100,
    orderSize: 10_000,
    market: {
      volatility: 0.02,
      atr: 2,
      rvol: 3,
      spread: 0.05,
      liquidityScore: 0.5,
    },
  });

  assert.ok(estimate.entrySlippage > 0);
  assert.ok(estimate.exitSlippage > 0);
});
