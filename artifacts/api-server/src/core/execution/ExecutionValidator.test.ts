import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionValidator } from "./ExecutionValidator";

test("ExecutionValidator rejects non-positive order quantity before portfolio checks", async () => {
  const result = await new ExecutionValidator().validateEntryOrder({
    signal: { id: 1, symbol: "ETHUSDT", direction: "LONG" },
    analysis: {
      entryPrice: 100,
      stopLoss: 98,
      tp1: 103,
      tp2: 105,
      tp3: 108,
      score: 95,
      reason: "test",
    },
    orderType: "MARKET",
    side: "BUY",
    requestedQuantity: 0,
    market: {},
  });

  assert.equal(result.approved, false);
  assert.equal(result.reason, "Order quantity must be greater than zero");
});
