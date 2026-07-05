import type { FairValueGap, SmcCandle, SmcDirection } from "./types";

export function detectFairValueGaps(candles: SmcCandle[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  for (let i = 0; i < candles.length - 2; i++) {
    const first = candles[i];
    const third = candles[i + 2];

    if (first.high < third.low) {
      gaps.push(buildGap("bullish", first.high, third.low, candles, i, i + 2));
    }
    if (first.low > third.high) {
      gaps.push(buildGap("bearish", third.high, first.low, candles, i, i + 2));
    }
  }
  return gaps;
}

export function latestValidFvg(candles: SmcCandle[], direction: SmcDirection, afterIndex = 0): FairValueGap | null {
  return detectFairValueGaps(candles)
    .filter((gap) => gap.direction === direction && gap.endIndex >= afterIndex && !gap.mitigated)
    .sort((a, b) => b.endIndex - a.endIndex)[0] ?? null;
}

function buildGap(
  direction: SmcDirection,
  lower: number,
  upper: number,
  candles: SmcCandle[],
  startIndex: number,
  endIndex: number,
): FairValueGap {
  const future = candles.slice(endIndex + 1);
  const mitigated = future.some((candle) => direction === "bullish" ? candle.low <= upper : candle.high >= lower);
  const size = upper - lower;
  const midpoint = lower + size / 2;
  const freshness = Math.max(0, 100 - (candles.length - endIndex) * 3);
  const basis = candles[endIndex].close || midpoint;
  const score = Math.max(35, Math.min(100, freshness * 0.5 + (size / basis) * 5000));
  return {
    direction,
    lower,
    upper,
    midpoint,
    startTime: candles[startIndex].timestamp,
    endTime: candles[endIndex].timestamp,
    startIndex,
    endIndex,
    size,
    freshness,
    mitigated,
    score,
  };
}
