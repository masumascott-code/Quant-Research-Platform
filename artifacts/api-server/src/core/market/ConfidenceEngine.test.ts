import assert from "node:assert/strict";
import test from "node:test";
import { ConfidenceEngine } from "./ConfidenceEngine";

test("ConfidenceEngine combines weighted factors into a 0-100 score", () => {
  const score = new ConfidenceEngine().score({
    regime: { regime: "TRENDING_BULL", strength: 80, confidence: 80 },
    trend: { emaAlignment: "BULLISH", adx: 40, marketStructure: "HIGHER_HIGH", higherHigh: true, lowerLow: false, breakOfStructure: true, changeOfCharacter: false, score: 85 },
    liquidity: { liquiditySweep: false, stopHunt: false, falseBreakout: false, equalHigh: false, equalLow: false, liquidityVoid: false, swingFailurePattern: false, score: 70 },
    volume: { relativeVolume: 2, volumeSpike: true, deltaApproximation: 100, volumeExpansion: true, volumeContraction: false, buyingPressure: 70, sellingPressure: 30, score: 80 },
    volatility: { atr: 2, atrExpansion: true, atrCompression: false, historicalVolatility: 0.4, volatilityPercentile: 60, score: 60 },
    session: { session: "LONDON", overlap: "LONDON_NEW_YORK", qualityScore: 90 },
    rrRatio: 2.5,
    signalQuality: 92,
  });

  assert.ok(score >= 0);
  assert.ok(score <= 100);
  assert.ok(score > 70);
});
