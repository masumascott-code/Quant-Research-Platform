import { atr, clamp, ema, sma } from "./indicators";
import type { MarketCandle, TrendResult } from "./types";

export class TrendStrengthEngine {
  analyze(candles: MarketCandle[]): TrendResult {
    if (candles.length < 10) {
      return { emaAlignment: "MIXED", adx: 0, marketStructure: "RANGE", higherHigh: false, lowerLow: false, breakOfStructure: false, changeOfCharacter: false, score: 0 };
    }

    const closes = candles.map((c) => c.close);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const ema100 = ema(closes, 100);
    const emaAlignment = ema20 > ema50 && ema50 > ema100 ? "BULLISH" : ema20 < ema50 && ema50 < ema100 ? "BEARISH" : "MIXED";
    const recent = candles.slice(-8);
    const higherHigh = recent[7]?.high > recent[5]?.high && recent[5]?.high > recent[3]?.high;
    const lowerLow = recent[7]?.low < recent[5]?.low && recent[5]?.low < recent[3]?.low;
    const marketStructure = higherHigh ? "HIGHER_HIGH" : lowerLow ? "LOWER_LOW" : "RANGE";
    const priorHigh = Math.max(...candles.slice(-12, -2).map((c) => c.high));
    const priorLow = Math.min(...candles.slice(-12, -2).map((c) => c.low));
    const last = candles[candles.length - 1];
    const breakOfStructure = last.close > priorHigh || last.close < priorLow;
    const changeOfCharacter = (emaAlignment === "BULLISH" && last.close < priorLow) || (emaAlignment === "BEARISH" && last.close > priorHigh);
    const adx = this.approxAdx(candles);
    const score = clamp(
      (emaAlignment !== "MIXED" ? 30 : 10) +
      (higherHigh || lowerLow ? 25 : 0) +
      (breakOfStructure ? 20 : 0) +
      (changeOfCharacter ? -15 : 0) +
      adx * 0.5
    );

    return { emaAlignment, adx, marketStructure, higherHigh, lowerLow, breakOfStructure, changeOfCharacter, score };
  }

  private approxAdx(candles: MarketCandle[]): number {
    const period = Math.min(14, candles.length - 1);
    if (period <= 1) return 0;
    const directionalMoves: number[] = [];
    for (let i = candles.length - period; i < candles.length; i++) {
      const up = candles[i].high - candles[i - 1].high;
      const down = candles[i - 1].low - candles[i].low;
      directionalMoves.push(Math.abs(up - down));
    }
    const averageDirectionalMove = sma(directionalMoves, period);
    const currentAtr = atr(candles, period);
    return currentAtr > 0 ? clamp((averageDirectionalMove / currentAtr) * 100) : 0;
  }
}
