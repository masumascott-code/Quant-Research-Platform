export interface IndicatorCandle {
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type IndicatorPoint = number | null;

export interface BandsPoint {
  middle: IndicatorPoint;
  upper: IndicatorPoint;
  lower: IndicatorPoint;
}

export interface MacdPoint {
  macd: IndicatorPoint;
  signal: IndicatorPoint;
  histogram: IndicatorPoint;
}

export interface StochasticPoint {
  k: IndicatorPoint;
  d: IndicatorPoint;
}

export interface DonchianPoint {
  upper: IndicatorPoint;
  middle: IndicatorPoint;
  lower: IndicatorPoint;
}

export interface SupertrendPoint {
  value: IndicatorPoint;
  direction: "bullish" | "bearish" | null;
}

export interface SwingRange {
  swingHigh: number;
  swingHighIndex: number;
  swingLow: number;
  swingLowIndex: number;
  direction: "bullish" | "bearish";
}

export interface FibonacciLevels {
  swingHigh: number;
  swingLow: number;
  direction: "bullish" | "bearish";
  levels: Record<"0.236" | "0.382" | "0.5" | "0.618" | "0.705" | "0.786", number>;
}

export interface FibonacciExtensions {
  swingHigh: number;
  swingLow: number;
  direction: "bullish" | "bearish";
  levels: Record<"1.272" | "1.618" | "2.0", number>;
}

export interface FibonacciConfluence {
  range: SwingRange;
  retracement: FibonacciLevels;
  extension: FibonacciExtensions;
  zone: "discount" | "premium" | "equilibrium" | "outside";
  ote: boolean;
  confluenceScore: number;
  reason: string;
}

const RETRACEMENT_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.705, 0.786] as const;
const EXTENSION_RATIOS = [1.272, 1.618, 2.0] as const;

export function sma(values: number[], period: number): IndicatorPoint[] {
  assertPeriod(period);
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    return average(window);
  });
}

export function ema(values: number[], period: number): IndicatorPoint[] {
  assertPeriod(period);
  const output: IndicatorPoint[] = Array(values.length).fill(null);
  if (values.length < period) return output;

  const multiplier = 2 / (period + 1);
  let current = average(values.slice(0, period));
  output[period - 1] = current;
  for (let index = period; index < values.length; index++) {
    current = values[index] * multiplier + current * (1 - multiplier);
    output[index] = current;
  }

  return output;
}

export function vwap(candles: IndicatorCandle[]): IndicatorPoint[] {
  let priceVolume = 0;
  let totalVolume = 0;
  return candles.map((candle) => {
    const typical = typicalPrice(candle);
    priceVolume += typical * candle.volume;
    totalVolume += candle.volume;
    return totalVolume > 0 ? priceVolume / totalVolume : null;
  });
}

export function trueRange(candles: IndicatorCandle[]): number[] {
  return candles.map((candle, index) => {
    const previousClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
}

export function atr(candles: IndicatorCandle[], period = 14): IndicatorPoint[] {
  return wilders(trueRange(candles), period);
}

export function adx(candles: IndicatorCandle[], period = 14): IndicatorPoint[] {
  assertPeriod(period);
  const plusDm: number[] = [0];
  const minusDm: number[] = [0];
  const ranges = trueRange(candles);

  for (let index = 1; index < candles.length; index++) {
    const upMove = candles[index].high - candles[index - 1].high;
    const downMove = candles[index - 1].low - candles[index].low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothedTr = wilders(ranges, period);
  const smoothedPlus = wilders(plusDm, period);
  const smoothedMinus = wilders(minusDm, period);
  const dx = candles.map((_, index) => {
    const tr = smoothedTr[index];
    const plus = smoothedPlus[index];
    const minus = smoothedMinus[index];
    if (!tr || plus == null || minus == null) return null;
    const plusDi = (100 * plus) / tr;
    const minusDi = (100 * minus) / tr;
    const total = plusDi + minusDi;
    return total > 0 ? (100 * Math.abs(plusDi - minusDi)) / total : 0;
  });

  return wildersNullable(dx, period);
}

export function supertrend(candles: IndicatorCandle[], period = 10, multiplier = 3): SupertrendPoint[] {
  const atrValues = atr(candles, period);
  const output: SupertrendPoint[] = candles.map(() => ({ value: null, direction: null }));
  let finalUpper = 0;
  let finalLower = 0;
  let direction: "bullish" | "bearish" = "bullish";

  for (let index = 0; index < candles.length; index++) {
    const atrValue = atrValues[index];
    if (atrValue == null) continue;

    const hl2 = (candles[index].high + candles[index].low) / 2;
    const basicUpper = hl2 + multiplier * atrValue;
    const basicLower = hl2 - multiplier * atrValue;
    const previous = candles[index - 1];

    finalUpper = index === period - 1 || basicUpper < finalUpper || (previous && previous.close > finalUpper)
      ? basicUpper
      : finalUpper;
    finalLower = index === period - 1 || basicLower > finalLower || (previous && previous.close < finalLower)
      ? basicLower
      : finalLower;

    if (candles[index].close > finalUpper) direction = "bullish";
    if (candles[index].close < finalLower) direction = "bearish";
    output[index] = { value: direction === "bullish" ? finalLower : finalUpper, direction };
  }

  return output;
}

export function bollingerBands(values: number[], period = 20, multiplier = 2): BandsPoint[] {
  assertPeriod(period);
  const middle = sma(values, period);
  return values.map((_, index) => {
    const mean = middle[index];
    if (mean == null) return { middle: null, upper: null, lower: null };
    const deviation = stddev(values.slice(index - period + 1, index + 1));
    return { middle: mean, upper: mean + deviation * multiplier, lower: mean - deviation * multiplier };
  });
}

export function rsi(values: number[], period = 14): IndicatorPoint[] {
  assertPeriod(period);
  const output: IndicatorPoint[] = Array(values.length).fill(null);
  if (values.length <= period) return output;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let index = 1; index <= period; index++) {
    const change = values[index] - values[index - 1];
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));
  }

  let avgGain = average(gains);
  let avgLoss = average(losses);
  output[period] = rsiFromAverages(avgGain, avgLoss);

  for (let index = period + 1; index < values.length; index++) {
    const change = values[index] - values[index - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, change)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -change)) / period;
    output[index] = rsiFromAverages(avgGain, avgLoss);
  }

  return output;
}

export function macd(values: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MacdPoint[] {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const macdLine = values.map((_, index) => (
    fast[index] != null && slow[index] != null ? fast[index]! - slow[index]! : null
  ));
  const compactSignal = ema(macdLine.filter((value): value is number => value != null), signalPeriod);
  let signalIndex = 0;

  return values.map((_, index) => {
    const macdValue = macdLine[index];
    if (macdValue == null) return { macd: null, signal: null, histogram: null };
    const signalValue = compactSignal[signalIndex++] ?? null;
    return {
      macd: macdValue,
      signal: signalValue,
      histogram: signalValue == null ? null : macdValue - signalValue,
    };
  });
}

export function stochastic(candles: IndicatorCandle[], period = 14, signalPeriod = 3): StochasticPoint[] {
  const k = candles.map((candle, index) => {
    if (index < period - 1) return null;
    const window = candles.slice(index - period + 1, index + 1);
    const highest = Math.max(...window.map((item) => item.high));
    const lowest = Math.min(...window.map((item) => item.low));
    return highest > lowest ? (100 * (candle.close - lowest)) / (highest - lowest) : 0;
  });
  const d = smaNullable(k, signalPeriod);
  return candles.map((_, index) => ({ k: k[index], d: d[index] }));
}

export function cci(candles: IndicatorCandle[], period = 20): IndicatorPoint[] {
  assertPeriod(period);
  const typical = candles.map(typicalPrice);
  const averageTypical = sma(typical, period);
  return typical.map((value, index) => {
    const mean = averageTypical[index];
    if (mean == null) return null;
    const window = typical.slice(index - period + 1, index + 1);
    const meanDeviation = average(window.map((item) => Math.abs(item - mean)));
    return meanDeviation > 0 ? (value - mean) / (0.015 * meanDeviation) : 0;
  });
}

export function donchianChannel(candles: IndicatorCandle[], period = 20): DonchianPoint[] {
  assertPeriod(period);
  return candles.map((_, index) => {
    if (index < period - 1) return { upper: null, middle: null, lower: null };
    const window = candles.slice(index - period + 1, index + 1);
    const upper = Math.max(...window.map((candle) => candle.high));
    const lower = Math.min(...window.map((candle) => candle.low));
    return { upper, middle: (upper + lower) / 2, lower };
  });
}

export function keltnerChannel(candles: IndicatorCandle[], period = 20, multiplier = 2): BandsPoint[] {
  const middle = ema(candles.map((candle) => candle.close), period);
  const atrValues = atr(candles, period);
  return candles.map((_, index) => {
    if (middle[index] == null || atrValues[index] == null) return { middle: null, upper: null, lower: null };
    return {
      middle: middle[index],
      upper: middle[index]! + atrValues[index]! * multiplier,
      lower: middle[index]! - atrValues[index]! * multiplier,
    };
  });
}

export function obv(candles: IndicatorCandle[]): number[] {
  const output = [0];
  for (let index = 1; index < candles.length; index++) {
    const direction = Math.sign(candles[index].close - candles[index - 1].close);
    output.push(output[index - 1] + direction * candles[index].volume);
  }
  return output.slice(0, candles.length);
}

export function cmf(candles: IndicatorCandle[], period = 20): IndicatorPoint[] {
  assertPeriod(period);
  const moneyFlowVolume = candles.map((candle) => {
    const range = candle.high - candle.low;
    const multiplier = range > 0 ? ((candle.close - candle.low) - (candle.high - candle.close)) / range : 0;
    return multiplier * candle.volume;
  });

  return candles.map((_, index) => {
    if (index < period - 1) return null;
    const volume = sum(candles.slice(index - period + 1, index + 1).map((candle) => candle.volume));
    return volume > 0 ? sum(moneyFlowVolume.slice(index - period + 1, index + 1)) / volume : 0;
  });
}

export function mfi(candles: IndicatorCandle[], period = 14): IndicatorPoint[] {
  assertPeriod(period);
  const rawFlow = candles.map((candle) => typicalPrice(candle) * candle.volume);
  return candles.map((_, index) => {
    if (index < period) return null;
    let positive = 0;
    let negative = 0;
    for (let offset = index - period + 1; offset <= index; offset++) {
      const currentTypical = typicalPrice(candles[offset]);
      const previousTypical = typicalPrice(candles[offset - 1]);
      if (currentTypical > previousTypical) positive += rawFlow[offset];
      if (currentTypical < previousTypical) negative += rawFlow[offset];
    }
    if (negative === 0) return 100;
    const ratio = positive / negative;
    return 100 - 100 / (1 + ratio);
  });
}

export function rvol(candles: IndicatorCandle[], period = 20): IndicatorPoint[] {
  assertPeriod(period);
  return candles.map((candle, index) => {
    if (index < period) return null;
    const baseline = average(candles.slice(index - period, index).map((item) => item.volume));
    return baseline > 0 ? candle.volume / baseline : null;
  });
}

export function detectSwingRange(candles: IndicatorCandle[], lookback = candles.length): SwingRange | null {
  if (candles.length === 0 || lookback < 2) return null;
  const start = Math.max(0, candles.length - lookback);
  const window = candles.slice(start);
  let highIndex = start;
  let lowIndex = start;

  for (let offset = 0; offset < window.length; offset++) {
    const index = start + offset;
    if (candles[index].high > candles[highIndex].high) highIndex = index;
    if (candles[index].low < candles[lowIndex].low) lowIndex = index;
  }

  return {
    swingHigh: candles[highIndex].high,
    swingHighIndex: highIndex,
    swingLow: candles[lowIndex].low,
    swingLowIndex: lowIndex,
    direction: lowIndex < highIndex ? "bullish" : "bearish",
  };
}

export function fibonacciRetracement(range: SwingRange, direction = range.direction): FibonacciLevels {
  const distance = range.swingHigh - range.swingLow;
  const levels = Object.fromEntries(RETRACEMENT_RATIOS.map((ratio) => {
    const level = direction === "bullish"
      ? range.swingHigh - distance * ratio
      : range.swingLow + distance * ratio;
    return [String(ratio), level];
  })) as FibonacciLevels["levels"];

  return { swingHigh: range.swingHigh, swingLow: range.swingLow, direction, levels };
}

export function fibonacciExtension(range: SwingRange, direction = range.direction): FibonacciExtensions {
  const distance = range.swingHigh - range.swingLow;
  const levels = Object.fromEntries(EXTENSION_RATIOS.map((ratio) => {
    const level = direction === "bullish"
      ? range.swingLow + distance * ratio
      : range.swingHigh - distance * ratio;
    return [String(ratio), level];
  })) as FibonacciExtensions["levels"];

  return { swingHigh: range.swingHigh, swingLow: range.swingLow, direction, levels };
}

export function fibonacciConfluence(
  candles: IndicatorCandle[],
  price: number,
  setupDirection: "LONG" | "SHORT",
  lookback = candles.length,
): FibonacciConfluence | null {
  const range = detectSwingRange(candles, lookback);
  if (!range) return null;

  const direction = setupDirection === "LONG" ? "bullish" : "bearish";
  const retracement = fibonacciRetracement(range, direction);
  const extension = fibonacciExtension(range, direction);
  const low = Math.min(range.swingLow, range.swingHigh);
  const high = Math.max(range.swingLow, range.swingHigh);
  if (price < low || price > high) {
    return { range, retracement, extension, zone: "outside", ote: false, confluenceScore: 0, reason: "Price is outside Fibonacci dealing range" };
  }

  const midpoint = (range.swingHigh + range.swingLow) / 2;
  const zone = Math.abs(price - midpoint) / Math.max(1e-12, high - low) <= 0.03
    ? "equilibrium"
    : price < midpoint ? "discount" : "premium";
  const oteLow = Math.min(retracement.levels["0.618"], retracement.levels["0.786"]);
  const oteHigh = Math.max(retracement.levels["0.618"], retracement.levels["0.786"]);
  const ote = price >= oteLow && price <= oteHigh;
  const directionalZone = setupDirection === "LONG" ? zone === "discount" : zone === "premium";
  const confluenceScore = directionalZone && ote ? 5 : directionalZone ? 3 : ote ? 2 : 0;

  return {
    range,
    retracement,
    extension,
    zone,
    ote,
    confluenceScore,
    reason: confluenceScore > 0
      ? "Fibonacci supports setup as confluence only"
      : "Fibonacci does not add directional confluence",
  };
}

function wilders(values: number[], period: number): IndicatorPoint[] {
  assertPeriod(period);
  const output: IndicatorPoint[] = Array(values.length).fill(null);
  if (values.length < period) return output;
  let current = average(values.slice(0, period));
  output[period - 1] = current;
  for (let index = period; index < values.length; index++) {
    current = (current * (period - 1) + values[index]) / period;
    output[index] = current;
  }
  return output;
}

function wildersNullable(values: IndicatorPoint[], period: number): IndicatorPoint[] {
  const output: IndicatorPoint[] = Array(values.length).fill(null);
  const compact: Array<{ value: number; index: number }> = values
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => item.value != null);
  if (compact.length < period) return output;

  let current = average(compact.slice(0, period).map((item) => item.value));
  output[compact[period - 1].index] = current;
  for (let index = period; index < compact.length; index++) {
    current = (current * (period - 1) + compact[index].value) / period;
    output[compact[index].index] = current;
  }
  return output;
}

function smaNullable(values: IndicatorPoint[], period: number): IndicatorPoint[] {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    if (window.some((value) => value == null)) return null;
    return average(window as number[]);
  });
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function typicalPrice(candle: IndicatorCandle): number {
  return (candle.high + candle.low + candle.close) / 3;
}

function average(values: number[]): number {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function stddev(values: number[]): number {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("Indicator period must be a positive integer");
  }
}
