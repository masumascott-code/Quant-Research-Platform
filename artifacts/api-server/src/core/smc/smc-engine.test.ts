import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePremiumDiscount,
  calculateRiskPlan,
  calculateSmcScore,
  detectFairValueGaps,
  detectLiquiditySweep,
  detectOrderBlock,
  detectStructureEvents,
  detectSwingHighs,
  detectSwingLows,
  mapLiquidity,
  scoreRiskReward,
} from ".";
import type { SmcCandle } from "./types";

function candle(index: number, open: number, high: number, low: number, close: number, volume = 100): SmcCandle {
  return { timestamp: index * 60_000, open, high, low, close, volume };
}

test("detects swing highs and swing lows", () => {
  const candles = [
    candle(0, 100, 101, 99, 100),
    candle(1, 100, 105, 100, 104),
    candle(2, 104, 103, 98, 99),
    candle(3, 99, 102, 97, 101),
    candle(4, 101, 100, 96, 98),
  ];

  const highs = detectSwingHighs(candles, 1, 1);
  const lows = detectSwingLows(candles, 1, 1);

  assert.equal(highs[0]?.index, 1);
  assert.equal(highs[0]?.price, 105);
  assert.equal(lows.some((swing) => swing.index === 2 && swing.price === 98), true);
});

test("detects BOS after bullish structure continuation", () => {
  const candles = [
    candle(0, 100, 101, 99, 100),
    candle(1, 100, 104, 100, 103),
    candle(2, 103, 103, 100, 101),
    candle(3, 101, 105, 101, 104),
    candle(4, 104, 103, 101, 102),
    candle(5, 102, 108, 102, 107),
    candle(6, 107, 109, 105, 108),
  ];

  const events = detectStructureEvents(candles, 1, 1);

  assert.equal(events.some((event) => event.direction === "bullish" && event.type === "BOS"), true);
});

test("detects CHOCH when structure flips bearish", () => {
  const candles = [
    candle(0, 100, 101, 99, 100),
    candle(1, 100, 104, 100, 103),
    candle(2, 103, 103, 100, 101),
    candle(3, 101, 105, 101, 104),
    candle(4, 104, 103, 101, 102),
    candle(5, 102, 108, 102, 107),
    candle(6, 107, 107, 99, 99.5),
  ];

  const events = detectStructureEvents(candles, 1, 1);

  assert.equal(events.some((event) => event.direction === "bearish" && event.type === "CHOCH"), true);
});

test("detects sell-side liquidity sweep for long setup", () => {
  const candles = [
    candle(0, 100, 101, 99, 100),
    candle(1, 100, 102, 98, 101),
    candle(2, 101, 103, 100, 102),
    candle(3, 102, 103, 97.9, 100),
    candle(4, 100, 104, 97.7, 99),
    candle(5, 99, 102, 97.5, 100.5),
  ];

  const sweep = detectLiquiditySweep(candles, "LONG", mapLiquidity(candles, 0.004));

  assert.ok(sweep);
  assert.equal(sweep.sweepDirection, "sellSide");
  assert.equal(sweep.closeRecoveryConfirmed, true);
});

test("detects bullish and bearish fair value gaps", () => {
  const bullish = detectFairValueGaps([
    candle(0, 100, 101, 99, 100),
    candle(1, 100, 103, 100, 102),
    candle(2, 103, 105, 102, 104),
  ]);
  const bearish = detectFairValueGaps([
    candle(0, 105, 106, 104, 105),
    candle(1, 105, 105.5, 102, 103),
    candle(2, 103, 103.5, 100, 101),
  ]);

  assert.equal(bullish[0]?.direction, "bullish");
  assert.equal(bullish[0]?.lower, 101);
  assert.equal(bearish[0]?.direction, "bearish");
  assert.equal(bearish[0]?.upper, 104);
});

test("detects bullish and bearish order blocks before displacement", () => {
  const bullish = detectOrderBlock([
    candle(0, 100, 101, 99, 100),
    candle(1, 101, 102, 98, 99),
    candle(2, 99, 108, 99, 107),
  ], "bullish", 2);
  const bearish = detectOrderBlock([
    candle(0, 100, 101, 99, 100),
    candle(1, 99, 104, 99, 103),
    candle(2, 103, 103, 94, 95),
  ], "bearish", 2);

  assert.equal(bullish?.direction, "bullish");
  assert.equal(bullish?.originIndex, 1);
  assert.equal(bearish?.direction, "bearish");
  assert.equal(bearish?.originIndex, 1);
});

test("calculates premium and discount zone validity", () => {
  const candles = [
    candle(0, 100, 101, 99, 100),
    candle(1, 100, 110, 100, 108),
    candle(2, 108, 108, 96, 98),
    candle(3, 98, 105, 97, 104),
  ];

  const discount = calculatePremiumDiscount(candles, "LONG", 99);
  const premium = calculatePremiumDiscount(candles, "SHORT", 108);

  assert.equal(discount?.zone, "discount");
  assert.equal(discount?.validForDirection, true);
  assert.equal(premium?.zone, "premium");
  assert.equal(premium?.validForDirection, true);
});

test("calculates RR plan and RR score", () => {
  const levels = mapLiquidity([
    candle(0, 100, 110, 99, 105),
    candle(1, 105, 111, 104, 109),
    candle(2, 109, 108, 98, 100),
    candle(3, 100, 112, 99, 111),
  ]);
  const plan = calculateRiskPlan({
    direction: "LONG",
    currentPrice: 100,
    sweep: { sweptLevel: 98, sweepDirection: "sellSide", index: 2, time: 120_000, wickSize: 2, closeRecoveryConfirmed: true, strength: 80 },
    orderBlock: { direction: "bullish", low: 97.5, high: 101, open: 101, close: 99, originTime: 60_000, originIndex: 1, freshness: 90, mitigated: false, score: 85 },
    fvg: null,
    liquidityLevels: levels,
    minRiskReward: 2,
  });

  assert.ok(plan);
  assert.ok(plan.rr >= 2);
  assert.ok(scoreRiskReward(plan.rr, 2) >= 70);
});

test("calculates bounded SMC score from weighted components", () => {
  const score = calculateSmcScore({
    direction: "LONG",
    htfBias: "bullish",
    sweep: { sweptLevel: 98, sweepDirection: "sellSide", index: 4, time: 240_000, wickSize: 2, closeRecoveryConfirmed: true, strength: 90 },
    structureEvent: { type: "CHOCH", direction: "bullish", index: 5, time: 300_000, brokenLevel: 105, confirmationClose: 106, strength: 85 },
    displacement: { direction: "bullish", index: 5, time: 300_000, bodySize: 5, averageBody: 1.5, rvol: 2, strength: 88, createsImbalance: true },
    fvg: { direction: "bullish", lower: 101, upper: 103, midpoint: 102, startTime: 0, endTime: 120_000, startIndex: 0, endIndex: 2, size: 2, freshness: 95, mitigated: false, score: 90 },
    orderBlock: null,
    premiumDiscount: { swingHigh: 110, swingLow: 96, equilibrium: 103, zone: "discount", validForDirection: true, score: 90 },
    rr: 2.5,
    minRiskReward: 2,
  });

  assert.ok(score.total >= 80);
  assert.ok(score.total <= 100);
  assert.equal(score.htfBias, 15);
});
