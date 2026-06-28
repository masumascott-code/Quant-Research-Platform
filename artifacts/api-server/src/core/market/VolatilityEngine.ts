import { atr, clamp, returns, stddev, trueRanges } from "./indicators";
import type { MarketCandle, VolatilityResult } from "./types";

export class VolatilityEngine {
  analyze(candles: MarketCandle[]): VolatilityResult {
    const currentAtr = atr(candles, 14);
    const priorAtr = atr(candles.slice(0, -10), 14);
    const ranges = trueRanges(candles);
    const rankBase = ranges.slice(-60);
    const percentile = rankBase.length > 0
      ? rankBase.filter((value) => value <= currentAtr).length / rankBase.length
      : 0;
    const historicalVolatility = stddev(returns(candles).slice(-30)) * Math.sqrt(365);
    const atrRatio = priorAtr > 0 ? currentAtr / priorAtr : 1;
    const atrExpansion = atrRatio > 1.2;
    const atrCompression = atrRatio < 0.8;
    const score = clamp(percentile * 100);

    return { atr: currentAtr, atrExpansion, atrCompression, historicalVolatility, volatilityPercentile: percentile * 100, score };
  }
}
