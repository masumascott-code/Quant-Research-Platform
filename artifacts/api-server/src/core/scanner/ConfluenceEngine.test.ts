import assert from "node:assert/strict";
import test from "node:test";
import { ConfluenceEngine } from "./ConfluenceEngine";
import type { MarketContext } from "../market";

function context(): MarketContext {
  return {
    symbol: "ETHUSDT",
    direction: "LONG",
    marketRegime: { regime: "TRENDING_BULL", strength: 80, confidence: 80 },
    session: { session: "LONDON", overlap: null, qualityScore: 70 },
    liquidity: { liquiditySweep: false, stopHunt: false, falseBreakout: false, equalHigh: false, equalLow: false, liquidityVoid: false, swingFailurePattern: false, score: 60 },
    volume: { relativeVolume: 2, volumeSpike: true, deltaApproximation: 100, volumeExpansion: true, volumeContraction: false, buyingPressure: 70, sellingPressure: 30, score: 75 },
    volatility: { atr: 2, atrExpansion: true, atrCompression: false, historicalVolatility: 0.4, volatilityPercentile: 50, score: 50 },
    trend: { emaAlignment: "BULLISH", adx: 35, marketStructure: "HIGHER_HIGH", higherHigh: true, lowerLow: false, breakOfStructure: true, changeOfCharacter: false, score: 85 },
    confidence: 78,
    liquidityScore: 60,
    trendScore: 85,
    volumeScore: 75,
    volatilityScore: 50,
    opportunityRank: 1,
    riskGrade: "LOW",
  };
}

test("ConfluenceEngine produces a bounded final score from weighted factors", () => {
  const result = new ConfluenceEngine().calculate({
    score: 90,
    grade: "A",
    confidence: "High",
    direction: "LONG",
    entryPrice: 100,
    stopLoss: 98,
    tp1: 103,
    tp2: 105,
    tp3: 108,
    rrRatio: 2.5,
    reason: "test",
  }, context());

  assert.ok(result.finalScore >= 0);
  assert.ok(result.finalScore <= 100);
  assert.equal(result.technicalScore, 90);
});
