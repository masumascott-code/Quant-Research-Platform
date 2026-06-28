import { atr, clamp, ema, returns, stddev } from "./indicators";
import type { MarketCandle, RegimeResult } from "./types";

export class MarketRegimeDetector {
  detect(candles: MarketCandle[]): RegimeResult {
    if (candles.length < 20) {
      return { regime: "SIDEWAYS", strength: 0, confidence: 0 };
    }

    const closes = candles.map((c) => c.close);
    const fast = ema(closes, 20);
    const slow = ema(closes, 50);
    const price = closes[closes.length - 1];
    const currentAtr = atr(candles, 14);
    const priorAtr = atr(candles.slice(0, -10), 14);
    const hv = stddev(returns(candles).slice(-30));
    const trendDistance = price > 0 ? Math.abs(fast - slow) / price : 0;
    const atrRatio = priorAtr > 0 ? currentAtr / priorAtr : 1;

    if (hv > 0.04 || atrRatio > 1.8) {
      return { regime: "VOLATILE", strength: clamp(hv * 1500), confidence: clamp(atrRatio * 45) };
    }
    if (atrRatio < 0.75) {
      return { regime: "COMPRESSION", strength: clamp((1 - atrRatio) * 120), confidence: clamp((1 - atrRatio) * 150) };
    }
    if (atrRatio > 1.25) {
      return { regime: "EXPANSION", strength: clamp((atrRatio - 1) * 100), confidence: clamp((atrRatio - 1) * 120) };
    }
    if (trendDistance < 0.002) {
      return { regime: "SIDEWAYS", strength: clamp((0.002 - trendDistance) * 20000), confidence: 60 };
    }

    const bullish = fast > slow && price > fast;
    return {
      regime: bullish ? "TRENDING_BULL" : "TRENDING_BEAR",
      strength: clamp(trendDistance * 4000),
      confidence: clamp(55 + trendDistance * 3000),
    };
  }
}
