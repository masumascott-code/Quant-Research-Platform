import { logger } from "../lib/logger";

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface SignalAnalysis {
  score: number;
  grade: "A+" | "A" | null;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rrRatio: number;
  reason: string;
  slReason: string;
  trendScore: number;
  structureScore: number;
  volumeScore: number;
  breakoutScore: number;
  retestScore: number;
  ema20: number;
  ema50: number;
  atr14: number;
}

function calcEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const emas: number[] = [];
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emas.push(ema);
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emas.push(ema);
  }
  return emas;
}

function calcATR(candles: CandleData[], period: number): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcRVOL(candles: CandleData[], lookback = 20): number {
  if (candles.length < lookback + 1) return 1;
  const current = candles[candles.length - 1].volume;
  const avg = candles.slice(-lookback - 1, -1).reduce((a, b) => a + b.volume, 0) / lookback;
  return avg > 0 ? current / avg : 1;
}

function detectHigherHighHigherLow(candles: CandleData[]): boolean {
  if (candles.length < 6) return false;
  const recent = candles.slice(-6);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  const lastHigher = highs[highs.length - 1] > highs[highs.length - 3];
  const lastLowHigher = lows[lows.length - 1] > lows[lows.length - 3];
  return lastHigher && lastLowHigher;
}

function detectLowerHighLowerLow(candles: CandleData[]): boolean {
  if (candles.length < 6) return false;
  const recent = candles.slice(-6);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  const lastLower = highs[highs.length - 1] < highs[highs.length - 3];
  const lastLowLower = lows[lows.length - 1] < lows[lows.length - 3];
  return lastLower && lastLowLower;
}

function detectBreakout(candles: CandleData[], ema20: number): boolean {
  if (candles.length < 5) return false;
  const recent = candles.slice(-5);
  const resistance = Math.max(...recent.slice(0, -1).map(c => c.high));
  const lastClose = recent[recent.length - 1].close;
  return lastClose > resistance && lastClose > ema20;
}

function detectBreakdown(candles: CandleData[], ema20: number): boolean {
  if (candles.length < 5) return false;
  const recent = candles.slice(-5);
  const support = Math.min(...recent.slice(0, -1).map(c => c.low));
  const lastClose = recent[recent.length - 1].close;
  return lastClose < support && lastClose < ema20;
}

function detectRetest(candles: CandleData[], level: number, tolerance = 0.002): boolean {
  if (candles.length < 3) return false;
  const c = candles[candles.length - 2];
  const tested = Math.abs(c.low - level) / level < tolerance || Math.abs(c.close - level) / level < tolerance;
  const bounced = candles[candles.length - 1].close > c.close;
  return tested && bounced;
}

function detectRetestShort(candles: CandleData[], level: number, tolerance = 0.002): boolean {
  if (candles.length < 3) return false;
  const c = candles[candles.length - 2];
  const tested = Math.abs(c.high - level) / level < tolerance || Math.abs(c.close - level) / level < tolerance;
  const rejected = candles[candles.length - 1].close < c.close;
  return tested && rejected;
}

function isBullishCandle(candle: CandleData): boolean {
  return candle.close > candle.open && (candle.close - candle.open) / candle.open > 0.001;
}

function isBearishCandle(candle: CandleData): boolean {
  return candle.close < candle.open && (candle.open - candle.close) / candle.open > 0.001;
}

export function analyzeForLong(
  symbol: string,
  candles: CandleData[],
  currentPrice: number,
  volume24h: number
): SignalAnalysis | null {
  if (candles.length < 60) return null;

  const closes = candles.map(c => c.close);
  const ema20arr = calcEMA(closes, 20);
  const ema50arr = calcEMA(closes, 50);
  const ema20 = ema20arr[ema20arr.length - 1];
  const ema50 = ema50arr[ema50arr.length - 1];
  const atr14 = calcATR(candles, 14);
  const rvol = calcRVOL(candles);

  // --- TREND SCORE (20 pts) ---
  let trendScore = 0;
  if (ema20 > ema50) trendScore += 10;
  if (currentPrice > ema20) trendScore += 5;
  if (currentPrice > ema50) trendScore += 5;

  // --- MARKET STRUCTURE SCORE (20 pts) ---
  let structureScore = 0;
  if (detectHigherHighHigherLow(candles)) structureScore += 20;
  else if (candles[candles.length - 1].close > candles[candles.length - 2].close) structureScore += 8;

  // --- VOLUME / RVOL SCORE (20 pts) ---
  let volumeScore = 0;
  if (rvol >= 2.0) volumeScore = 20;
  else if (rvol >= 1.8) volumeScore = 16;
  else if (rvol >= 1.5) volumeScore = 12;
  if (volume24h >= 100_000_000) volumeScore = Math.min(20, volumeScore + 2);

  // --- BREAKOUT SCORE (20 pts) ---
  let breakoutScore = 0;
  const hasBreakout = detectBreakout(candles, ema20);
  if (hasBreakout) breakoutScore = 20;

  // --- RETEST SCORE (20 pts) ---
  let retestScore = 0;
  const recentHigh = Math.max(...candles.slice(-10, -5).map(c => c.high));
  const hasRetest = detectRetest(candles, ema20) || detectRetest(candles, recentHigh, 0.003);
  if (hasRetest) retestScore += 15;
  if (isBullishCandle(candles[candles.length - 1])) retestScore += 5;

  const score = trendScore + structureScore + volumeScore + breakoutScore + retestScore;

  if (score < 90) return null;

  const grade = score >= 95 ? "A+" : "A";

  // Dynamic SL calculation
  const swingLow = Math.min(...candles.slice(-10).map(c => c.low));
  const slCandidates = [swingLow - atr14 * 0.5, ema20 - atr14 * 1.5, currentPrice - atr14 * 2];
  const stopLoss = Math.min(...slCandidates.filter(s => s > 0 && s < currentPrice));
  const risk = currentPrice - stopLoss;

  if (risk <= 0 || risk / currentPrice > 0.05) return null;

  const tp1 = currentPrice + risk;
  const tp2 = currentPrice + risk * 2;
  const tp3 = currentPrice + risk * 3;
  const rrRatio = (tp2 - currentPrice) / risk;

  if (rrRatio < 2) return null;

  const slReason = `Swing Low (${swingLow.toFixed(4)}) minus 0.5x ATR(${atr14.toFixed(4)}), confirmed by EMA20 (${ema20.toFixed(4)})`;
  const reason = `LONG setup: EMA20 (${ema20.toFixed(2)}) > EMA50 (${ema50.toFixed(2)}), HH+HL structure, RVOL ${rvol.toFixed(2)}x, breakout confirmed above resistance. Score ${score}/100 (Trend:${trendScore} Structure:${structureScore} Volume:${volumeScore} Breakout:${breakoutScore} Retest:${retestScore})`;

  return { score, grade, direction: "LONG", entryPrice: currentPrice, stopLoss, tp1, tp2, tp3, rrRatio, reason, slReason, trendScore, structureScore, volumeScore, breakoutScore, retestScore, ema20, ema50, atr14 };
}

export function analyzeForShort(
  symbol: string,
  candles: CandleData[],
  currentPrice: number,
  volume24h: number
): SignalAnalysis | null {
  if (candles.length < 60) return null;

  const closes = candles.map(c => c.close);
  const ema20arr = calcEMA(closes, 20);
  const ema50arr = calcEMA(closes, 50);
  const ema20 = ema20arr[ema20arr.length - 1];
  const ema50 = ema50arr[ema50arr.length - 1];
  const atr14 = calcATR(candles, 14);
  const rvol = calcRVOL(candles);

  // --- TREND SCORE (20 pts) ---
  let trendScore = 0;
  if (ema20 < ema50) trendScore += 10;
  if (currentPrice < ema20) trendScore += 5;
  if (currentPrice < ema50) trendScore += 5;

  // --- MARKET STRUCTURE SCORE (20 pts) ---
  let structureScore = 0;
  if (detectLowerHighLowerLow(candles)) structureScore += 20;
  else if (candles[candles.length - 1].close < candles[candles.length - 2].close) structureScore += 8;

  // --- VOLUME / RVOL SCORE (20 pts) ---
  let volumeScore = 0;
  if (rvol >= 2.0) volumeScore = 20;
  else if (rvol >= 1.8) volumeScore = 16;
  else if (rvol >= 1.5) volumeScore = 12;
  if (volume24h >= 100_000_000) volumeScore = Math.min(20, volumeScore + 2);

  // --- BREAKDOWN SCORE (20 pts) ---
  let breakoutScore = 0;
  const hasBreakdown = detectBreakdown(candles, ema20);
  if (hasBreakdown) breakoutScore = 20;

  // --- RETEST SCORE (20 pts) ---
  let retestScore = 0;
  const recentLow = Math.min(...candles.slice(-10, -5).map(c => c.low));
  const hasRetest = detectRetestShort(candles, ema20) || detectRetestShort(candles, recentLow, 0.003);
  if (hasRetest) retestScore += 15;
  if (isBearishCandle(candles[candles.length - 1])) retestScore += 5;

  const score = trendScore + structureScore + volumeScore + breakoutScore + retestScore;

  if (score < 90) return null;

  const grade = score >= 95 ? "A+" : "A";

  // Dynamic SL calculation
  const swingHigh = Math.max(...candles.slice(-10).map(c => c.high));
  const slCandidates = [swingHigh + atr14 * 0.5, ema20 + atr14 * 1.5, currentPrice + atr14 * 2];
  const stopLoss = Math.max(...slCandidates.filter(s => s > currentPrice));
  const risk = stopLoss - currentPrice;

  if (risk <= 0 || risk / currentPrice > 0.05) return null;

  const tp1 = currentPrice - risk;
  const tp2 = currentPrice - risk * 2;
  const tp3 = currentPrice - risk * 3;
  const rrRatio = (currentPrice - tp2) / risk;

  if (rrRatio < 2) return null;

  const slReason = `Swing High (${swingHigh.toFixed(4)}) plus 0.5x ATR(${atr14.toFixed(4)}), confirmed by EMA20 (${ema20.toFixed(4)})`;
  const reason = `SHORT setup: EMA20 (${ema20.toFixed(2)}) < EMA50 (${ema50.toFixed(2)}), LH+LL structure, RVOL ${rvol.toFixed(2)}x, breakdown confirmed below support. Score ${score}/100 (Trend:${trendScore} Structure:${structureScore} Volume:${volumeScore} Breakdown:${breakoutScore} Retest:${retestScore})`;

  return { score, grade, direction: "SHORT", entryPrice: currentPrice, stopLoss, tp1, tp2, tp3, rrRatio, reason, slReason, trendScore, structureScore, volumeScore, breakoutScore, retestScore, ema20, ema50, atr14 };
}
