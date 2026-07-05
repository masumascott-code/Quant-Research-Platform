import type { Displacement, SmcCandle, SmcDirection } from "./types";

export function detectDisplacement(
  candles: SmcCandle[],
  direction: SmcDirection,
  afterIndex = 0,
  lookback = 12,
): Displacement | null {
  for (let i = Math.max(1, afterIndex + 1); i < candles.length; i++) {
    const candle = candles[i];
    const previous = candles.slice(Math.max(0, i - lookback), i);
    if (previous.length < 3) continue;

    const bodySize = Math.abs(candle.close - candle.open);
    const averageBody = previous.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / previous.length;
    const averageVolume = previous.reduce((sum, c) => sum + c.volume, 0) / previous.length;
    const rvol = averageVolume > 0 ? candle.volume / averageVolume : 1;
    const directional = direction === "bullish" ? candle.close > candle.open : candle.close < candle.open;
    if (!directional || averageBody <= 0) continue;

    const bodyExpansion = bodySize / averageBody;
    if (bodyExpansion < 1.6) continue;

    const createsImbalance = direction === "bullish"
      ? candles[i - 2] != null && candles[i - 2].high < candle.low
      : candles[i - 2] != null && candles[i - 2].low > candle.high;
    const strength = Math.max(45, Math.min(100, bodyExpansion * 28 + Math.min(rvol, 4) * 8 + (createsImbalance ? 12 : 0)));

    return {
      direction,
      index: i,
      time: candle.timestamp,
      bodySize,
      averageBody,
      rvol,
      strength,
      createsImbalance,
    };
  }

  return null;
}
