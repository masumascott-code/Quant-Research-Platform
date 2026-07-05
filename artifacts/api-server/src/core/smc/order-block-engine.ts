import type { OrderBlock, SmcCandle, SmcDirection } from "./types";

export function detectOrderBlock(
  candles: SmcCandle[],
  direction: SmcDirection,
  displacementIndex: number,
): OrderBlock | null {
  const start = Math.max(0, displacementIndex - 10);
  const candidates = candles.slice(start, displacementIndex).map((candle, offset) => ({
    candle,
    index: start + offset,
  }));
  const origin = [...candidates].reverse().find(({ candle }) =>
    direction === "bullish" ? candle.close < candle.open : candle.close > candle.open
  );
  if (!origin) return null;

  const future = candles.slice(displacementIndex + 1);
  const mitigated = future.some((candle) =>
    direction === "bullish"
      ? candle.low <= Math.max(origin.candle.open, origin.candle.close)
      : candle.high >= Math.min(origin.candle.open, origin.candle.close)
  );
  const freshness = Math.max(0, 100 - (candles.length - origin.index) * 2);
  const range = origin.candle.high - origin.candle.low;
  const basis = origin.candle.close || origin.candle.open;
  const score = Math.max(35, Math.min(100, freshness * 0.55 + (range / basis) * 3500));

  return {
    direction,
    low: origin.candle.low,
    high: origin.candle.high,
    open: origin.candle.open,
    close: origin.candle.close,
    originTime: origin.candle.timestamp,
    originIndex: origin.index,
    freshness,
    mitigated,
    score,
  };
}
