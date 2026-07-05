import type { LiquidityLevel, LiquiditySweep, SmcCandle, TradeDirection } from "./types";
import { detectSwingHighs, detectSwingLows } from "./smc-structure-engine";

export function mapLiquidity(candles: SmcCandle[], tolerance = 0.0015): LiquidityLevel[] {
  const levels: LiquidityLevel[] = [];
  const highs = detectSwingHighs(candles, 2, 2);
  const lows = detectSwingLows(candles, 2, 2);

  for (const swing of highs.slice(-12)) {
    levels.push({
      type: "swingHigh",
      side: "buySide",
      price: swing.price,
      indices: [swing.index],
      time: swing.time,
      strength: swing.strength,
    });
  }
  for (const swing of lows.slice(-12)) {
    levels.push({
      type: "swingLow",
      side: "sellSide",
      price: swing.price,
      indices: [swing.index],
      time: swing.time,
      strength: swing.strength,
    });
  }

  levels.push(...detectEqualLevels(highs, "high", tolerance));
  levels.push(...detectEqualLevels(lows, "low", tolerance));

  const previous = candles.slice(-96, -1);
  if (previous.length > 0) {
    const previousHigh = maxBy(previous, (c) => c.high);
    const previousLow = minBy(previous, (c) => c.low);
    levels.push({
      type: "previousHigh",
      side: "buySide",
      price: previousHigh.high,
      indices: [candles.indexOf(previousHigh)],
      time: previousHigh.timestamp,
      strength: 70,
    });
    levels.push({
      type: "previousLow",
      side: "sellSide",
      price: previousLow.low,
      indices: [candles.indexOf(previousLow)],
      time: previousLow.timestamp,
      strength: 70,
    });
  }

  return levels.sort((a, b) => b.time - a.time);
}

export function detectLiquiditySweep(
  candles: SmcCandle[],
  direction: TradeDirection,
  levels = mapLiquidity(candles),
): LiquiditySweep | null {
  const side = direction === "LONG" ? "sellSide" : "buySide";
  const candidates = levels.filter((level) => level.side === side);

  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 16); i--) {
    const candle = candles[i];
    for (const level of candidates) {
      if (level.indices.some((index) => index >= i)) continue;
      const totalRange = candle.high - candle.low;
      if (totalRange <= 0) continue;

      if (direction === "LONG" && candle.low < level.price && candle.close > level.price) {
        const wickSize = Math.min(candle.open, candle.close) - candle.low;
        return {
          sweptLevel: level.price,
          sweepDirection: "sellSide",
          index: i,
          time: candle.timestamp,
          wickSize,
          closeRecoveryConfirmed: true,
          strength: sweepStrength(wickSize, totalRange, level.strength),
        };
      }

      if (direction === "SHORT" && candle.high > level.price && candle.close < level.price) {
        const wickSize = candle.high - Math.max(candle.open, candle.close);
        return {
          sweptLevel: level.price,
          sweepDirection: "buySide",
          index: i,
          time: candle.timestamp,
          wickSize,
          closeRecoveryConfirmed: true,
          strength: sweepStrength(wickSize, totalRange, level.strength),
        };
      }
    }
  }

  return null;
}

export function nextLiquidityTarget(levels: LiquidityLevel[], direction: TradeDirection, entry: number): number | null {
  const side = direction === "LONG" ? "buySide" : "sellSide";
  const candidates = levels
    .filter((level) => level.side === side)
    .filter((level) => direction === "LONG" ? level.price > entry : level.price < entry)
    .sort((a, b) => direction === "LONG" ? a.price - b.price : b.price - a.price);
  return candidates[0]?.price ?? null;
}

function detectEqualLevels(
  swings: Array<{ index: number; time: number; price: number; strength: number }>,
  type: "high" | "low",
  tolerance: number,
): LiquidityLevel[] {
  const levels: LiquidityLevel[] = [];
  for (let i = 0; i < swings.length; i++) {
    const cluster = [swings[i]];
    for (let j = i + 1; j < swings.length; j++) {
      if (Math.abs(swings[i].price - swings[j].price) / swings[i].price <= tolerance) {
        cluster.push(swings[j]);
      }
    }
    if (cluster.length >= 2) {
      const price = cluster.reduce((sum, swing) => sum + swing.price, 0) / cluster.length;
      levels.push({
        type: type === "high" ? "equalHigh" : "equalLow",
        side: type === "high" ? "buySide" : "sellSide",
        price,
        indices: cluster.map((s) => s.index),
        time: Math.max(...cluster.map((s) => s.time)),
        strength: Math.min(100, 60 + cluster.length * 10),
      });
    }
  }
  return levels;
}

function sweepStrength(wickSize: number, totalRange: number, levelStrength: number): number {
  return Math.max(40, Math.min(100, (wickSize / totalRange) * 70 + levelStrength * 0.3));
}

function maxBy<T>(values: T[], pick: (value: T) => number): T {
  return values.reduce((best, value) => pick(value) > pick(best) ? value : best, values[0]);
}

function minBy<T>(values: T[], pick: (value: T) => number): T {
  return values.reduce((best, value) => pick(value) < pick(best) ? value : best, values[0]);
}
