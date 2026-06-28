import type { MarketCandle } from "./types";

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

export function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let current = sma(values.slice(0, period), Math.min(period, values.length));
  for (const value of values.slice(period)) {
    current = value * k + current * (1 - k);
  }
  return current;
}

export function trueRanges(candles: MarketCandle[]): number[] {
  const ranges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    ranges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    ));
  }
  return ranges;
}

export function atr(candles: MarketCandle[], period = 14): number {
  return sma(trueRanges(candles), period);
}

export function returns(candles: MarketCandle[]): number[] {
  const values: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    if (prev > 0) values.push((candles[i].close - prev) / prev);
  }
  return values;
}

export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
