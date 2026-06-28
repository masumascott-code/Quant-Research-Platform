import { atr, clamp } from "./indicators";
import type { LiquidityResult, MarketCandle } from "./types";

export class LiquidityEngine {
  analyze(candles: MarketCandle[]): LiquidityResult {
    if (candles.length < 10) return this.empty();
    const recent = candles.slice(-10);
    const last = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    const rangeAtr = atr(candles, 14);
    const highs = recent.slice(0, -1).map((c) => c.high);
    const lows = recent.slice(0, -1).map((c) => c.low);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const tolerance = Math.max(rangeAtr * 0.1, last.close * 0.001);

    const equalHigh = highs.filter((value) => Math.abs(value - high) <= tolerance).length >= 2;
    const equalLow = lows.filter((value) => Math.abs(value - low) <= tolerance).length >= 2;
    const liquiditySweep = last.high > high && last.close < high || last.low < low && last.close > low;
    const stopHunt = liquiditySweep && last.volume > previous.volume * 1.2;
    const falseBreakout = last.high > high && last.close < previous.close || last.low < low && last.close > previous.close;
    const liquidityVoid = Math.abs(last.open - previous.close) > rangeAtr * 0.8;
    const swingFailurePattern = liquiditySweep && Math.abs(last.close - last.open) < (last.high - last.low) * 0.5;
    const score = clamp(
      (liquiditySweep ? 25 : 0) +
      (stopHunt ? 20 : 0) +
      (falseBreakout ? 20 : 0) +
      (equalHigh || equalLow ? 15 : 0) +
      (liquidityVoid ? 10 : 0) +
      (swingFailurePattern ? 10 : 0)
    );

    return { liquiditySweep, stopHunt, falseBreakout, equalHigh, equalLow, liquidityVoid, swingFailurePattern, score };
  }

  private empty(): LiquidityResult {
    return {
      liquiditySweep: false,
      stopHunt: false,
      falseBreakout: false,
      equalHigh: false,
      equalLow: false,
      liquidityVoid: false,
      swingFailurePattern: false,
      score: 0,
    };
  }
}
