import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionEngine } from "./ExecutionEngine";
import { OrderManager } from "./OrderManager";

test("ExecutionEngine fills a market order and reports fill ratio", async () => {
  const order = await new OrderManager().create({
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
    requestedQuantity: 5,
    market: {},
  });

  const result = await new ExecutionEngine().execute(order, {
    approved: true,
    reason: null,
    account: {
      accountId: null,
      accountType: "paper",
      currency: "USDT",
      equity: 1000,
      availableBalance: 1000,
      usedMargin: 0,
      freeMargin: 1000,
      leverage: 1,
    },
    sizing: null,
    summary: {
      currency: "USDT",
      equity: 1000,
      availableBalance: 1000,
      usedMargin: 0,
      freeMargin: 1000,
      dailyPnl: 0,
      openExposure: 0,
      openTrades: 0,
      winRate: 0,
      riskUsagePercent: 0,
    },
  });

  assert.equal(result.order.state, "FILLED");
  assert.equal(result.fillRatio, 1);
  assert.equal(result.averageFillPrice, 100);
});
