import assert from "node:assert/strict";
import test from "node:test";
import { OpportunityRankingEngine } from "./OpportunityRankingEngine";
import type { MarketContext } from "./types";

function context(symbol: string, direction: "LONG" | "SHORT", confidence: number): MarketContext {
  return {
    symbol,
    direction,
    marketRegime: { regime: "TRENDING_BULL", strength: confidence, confidence },
    session: { session: "LONDON", overlap: null, qualityScore: 70 },
    liquidity: { liquiditySweep: false, stopHunt: false, falseBreakout: false, equalHigh: false, equalLow: false, liquidityVoid: false, swingFailurePattern: false, score: confidence },
    volume: { relativeVolume: 1, volumeSpike: false, deltaApproximation: 0, volumeExpansion: false, volumeContraction: false, buyingPressure: 50, sellingPressure: 50, score: confidence },
    volatility: { atr: 1, atrExpansion: false, atrCompression: false, historicalVolatility: 0, volatilityPercentile: confidence, score: confidence },
    trend: { emaAlignment: "BULLISH", adx: confidence, marketStructure: "HIGHER_HIGH", higherHigh: true, lowerLow: false, breakOfStructure: true, changeOfCharacter: false, score: confidence },
    confidence,
    liquidityScore: confidence,
    trendScore: confidence,
    volumeScore: confidence,
    volatilityScore: confidence,
    opportunityRank: null,
    riskGrade: "LOW",
  };
}

test("OpportunityRankingEngine ranks candidates and returns top buckets", () => {
  const result = new OpportunityRankingEngine().rank([
    context("A", "LONG", 50),
    context("B", "SHORT", 90),
    context("C", "LONG", 70),
  ]);

  assert.equal(result.all[0].symbol, "B");
  assert.equal(result.top5.length, 3);
  assert.equal(result.bestLong?.symbol, "C");
  assert.equal(result.bestShort?.symbol, "B");
});
