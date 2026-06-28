import assert from "node:assert/strict";
import test from "node:test";
import { FeeEngine } from "./FeeEngine";

test("FeeEngine separates maker, taker, commission, funding and total fee", () => {
  const engine = new FeeEngine();
  const maker = engine.calculate({
    notional: 10_000,
    liquidityRole: "MAKER",
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0004,
    commissionRate: 0.0001,
    fundingFee: 1.5,
  });

  assert.equal(maker.makerFee, 2);
  assert.equal(maker.takerFee, 0);
  assert.equal(maker.commission, 1);
  assert.equal(maker.fundingFee, 1.5);
  assert.equal(maker.totalFee, 4.5);
});
