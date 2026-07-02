import assert from "node:assert/strict";
import test from "node:test";
import { isStopLossBreached } from "./signal-status";

test("isStopLossBreached invalidates long signals at or below stop loss", () => {
  assert.equal(
    isStopLossBreached({ direction: "LONG", stopLoss: 170 }, 169.99),
    true,
  );
  assert.equal(
    isStopLossBreached({ direction: "LONG", stopLoss: 170 }, 170),
    true,
  );
  assert.equal(
    isStopLossBreached({ direction: "LONG", stopLoss: 170 }, 170.01),
    false,
  );
});

test("isStopLossBreached invalidates short signals at or above stop loss", () => {
  assert.equal(
    isStopLossBreached({ direction: "SHORT", stopLoss: 170 }, 170.01),
    true,
  );
  assert.equal(
    isStopLossBreached({ direction: "SHORT", stopLoss: 170 }, 170),
    true,
  );
  assert.equal(
    isStopLossBreached({ direction: "SHORT", stopLoss: 170 }, 169.99),
    false,
  );
});

test("isStopLossBreached ignores non-finite prices", () => {
  assert.equal(
    isStopLossBreached({ direction: "LONG", stopLoss: 170 }, Number.NaN),
    false,
  );
  assert.equal(
    isStopLossBreached(
      { direction: "SHORT", stopLoss: Number.POSITIVE_INFINITY },
      170,
    ),
    false,
  );
});
