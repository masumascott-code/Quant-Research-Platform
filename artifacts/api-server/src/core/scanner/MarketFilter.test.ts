import assert from "node:assert/strict";
import test from "node:test";
import { MarketFilter } from "./MarketFilter";
import type { MarketContext } from "../market";

function context(confidence: number): MarketContext {
  return {
    symbol: "ETHUSDT",
    direction: "LONG",
    marketRegime: { regime: "TRENDING_BULL", strength: 80, confidence },
    session: { session: "LONDON", overlap: null, qualityScore: 70 },
    liquidity: { liquiditySweep: false, stopHunt: false, falseBreakout: false, equalHigh: false, equalLow: false, liquidityVoid: false, swingFailurePattern: false, score: 60 },
    volume: { relativeVolume: 1, volumeSpike: false, deltaApproximation: 0, volumeExpansion: false, volumeContraction: false, buyingPressure: 50, sellingPressure: 50, score: 60 },
    volatility: { atr: 1, atrExpansion: false, atrCompression: false, historicalVolatility: 0.2, volatilityPercentile: 50, score: 50 },
    trend: { emaAlignment: "BULLISH", adx: 35, marketStructure: "HIGHER_HIGH", higherHigh: true, lowerLow: false, breakOfStructure: true, changeOfCharacter: false, score: 70 },
    confidence,
    liquidityScore: 60,
    trendScore: 70,
    volumeScore: 60,
    volatilityScore: 50,
    opportunityRank: 1,
    riskGrade: "LOW",
  };
}

test("MarketFilter rejects duplicate active signals", () => {
  const result = new MarketFilter().evaluate({
    context: context(80),
    duplicateActiveSignal: true,
    portfolioAllowed: true,
  });

  assert.equal(result.accepted, false);
  assert.ok(result.rejectedReasons.includes("Duplicate active signal exists"));
});
