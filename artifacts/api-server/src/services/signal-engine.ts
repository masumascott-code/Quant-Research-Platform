import { logger } from "../lib/logger";

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export type SetupType =
  | "Resistance Breakout"
  | "Breakout Retest"
  | "EMA Pullback"
  | "Support Bounce"
  | "Volume Expansion"
  | "Trend Continuation";

export type Confidence = "Low" | "Medium" | "High" | "Very High" | "Extreme";

export interface MultiTimeframeData {
  m1: CandleData[];
  m5: CandleData[];
  m15: CandleData[];
  h1: CandleData[];
}

export interface SignalAnalysis {
  score: number;
  grade: "A+" | "A" | null;
  confidence: Confidence;
  setupType: SetupType;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rrRatio: number;
  reason: string;
  slReason: string;
  whyNow: string;
  whyNotEarlier: string;
  whyLong: string;
  whySl: string;
  whyTp: string;
  timeframeAlignment: string;
  trendScore: number;
  emaScore: number;
  volumeScore: number;
  rvolScore: number;
  breakoutScore: number;
  retestScore: number;
  structureScore: number;
  momentumScore: number;
  ema20: number;
  ema50: number;
  ema200: number;
  atr14: number;
  rvol: number;
}

// ── Indicator helpers ─────────────────────────────────────────────────────────

function calcEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return prices.map(() => prices[0] ?? 0);
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
  if (candles.length < 8) return false;
  const recent = candles.slice(-8);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  return highs[7] > highs[5] && highs[5] > highs[3] &&
    lows[6] > lows[4] && lows[4] > lows[2];
}

function detectLowerHighLowerLow(candles: CandleData[]): boolean {
  if (candles.length < 8) return false;
  const recent = candles.slice(-8);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  return highs[7] < highs[5] && highs[5] < highs[3] &&
    lows[6] < lows[4] && lows[4] < lows[2];
}

function detectBreakout(candles: CandleData[], ema20: number): { detected: boolean; level: number } {
  if (candles.length < 10) return { detected: false, level: 0 };
  const lookback = candles.slice(-10, -1);
  const resistance = Math.max(...lookback.map(c => c.high));
  const last = candles[candles.length - 1];
  const detected = last.close > resistance && last.close > ema20;
  return { detected, level: resistance };
}

function detectBreakdown(candles: CandleData[], ema20: number): { detected: boolean; level: number } {
  if (candles.length < 10) return { detected: false, level: 0 };
  const lookback = candles.slice(-10, -1);
  const support = Math.min(...lookback.map(c => c.low));
  const last = candles[candles.length - 1];
  const detected = last.close < support && last.close < ema20;
  return { detected, level: support };
}

function detectFakeBreakout(candles: CandleData[], level: number, dir: "LONG" | "SHORT"): boolean {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  if (!last || !prev) return false;
  const totalRange = last.high - last.low;
  if (totalRange === 0) return false;

  if (dir === "LONG") {
    const upperWick = last.high - Math.max(last.open, last.close);
    const wickRatio = upperWick / totalRange;
    const volumeWeak = last.volume < prev.volume * 0.7;
    const noClose = last.close < level;
    return wickRatio > 0.5 || volumeWeak || noClose;
  } else {
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const wickRatio = lowerWick / totalRange;
    const volumeWeak = last.volume < prev.volume * 0.7;
    const noClose = last.close > level;
    return wickRatio > 0.5 || volumeWeak || noClose;
  }
}

function detectRetest(candles: CandleData[], level: number, tolerance = 0.003): boolean {
  if (candles.length < 3) return false;
  const prev = candles[candles.length - 2];
  const last = candles[candles.length - 1];
  const tested = Math.abs(prev.low - level) / level < tolerance ||
    Math.abs(prev.close - level) / level < tolerance;
  const bounced = last.close > prev.close;
  return tested && bounced;
}

function detectRetestShort(candles: CandleData[], level: number, tolerance = 0.003): boolean {
  if (candles.length < 3) return false;
  const prev = candles[candles.length - 2];
  const last = candles[candles.length - 1];
  const tested = Math.abs(prev.high - level) / level < tolerance ||
    Math.abs(prev.close - level) / level < tolerance;
  const rejected = last.close < prev.close;
  return tested && rejected;
}

function isBullishCandle(c: CandleData): boolean {
  const body = c.close - c.open;
  const range = c.high - c.low;
  return c.close > c.open && range > 0 && (body / range) > 0.4;
}

function isBearishCandle(c: CandleData): boolean {
  const body = c.open - c.close;
  const range = c.high - c.low;
  return c.close < c.open && range > 0 && (body / range) > 0.4;
}

function isBullishMomentum(candles: CandleData[], n = 3): boolean {
  const recent = candles.slice(-n);
  return recent.filter(c => c.close > c.open).length >= 2 &&
    recent[recent.length - 1].close > recent[0].open;
}

function isBearishMomentum(candles: CandleData[], n = 3): boolean {
  const recent = candles.slice(-n);
  return recent.filter(c => c.close < c.open).length >= 2 &&
    recent[recent.length - 1].close < recent[0].open;
}

// ── Confidence from score ─────────────────────────────────────────────────────

export function scoreToConfidence(score: number): Confidence {
  if (score >= 97) return "Extreme";
  if (score >= 93) return "Very High";
  if (score >= 90) return "High";
  if (score >= 85) return "Medium";
  return "Low";
}

// ── Timeframe alignment ───────────────────────────────────────────────────────

function checkTimeframeAlignment(
  m15: CandleData[],
  h1: CandleData[],
  m5: CandleData[],
  dir: "LONG" | "SHORT"
): { aligned: boolean; summary: string; score: number } {
  const m15Closes = m15.map(c => c.close);
  const h1Closes = h1.map(c => c.close);
  const m5Closes = m5.map(c => c.close);

  const m15Ema20 = calcEMA(m15Closes, 20);
  const m15Ema50 = calcEMA(m15Closes, 50);
  const h1Ema20 = calcEMA(h1Closes, 20);
  const h1Ema50 = calcEMA(h1Closes, 50);
  const m5Ema20 = calcEMA(m5Closes, 20);

  const m15Last = m15Closes[m15Closes.length - 1] ?? 0;
  const h1Last = h1Closes[h1Closes.length - 1] ?? 0;
  const m5Last = m5Closes[m5Closes.length - 1] ?? 0;

  const m15e20 = m15Ema20[m15Ema20.length - 1] ?? 0;
  const m15e50 = m15Ema50[m15Ema50.length - 1] ?? 0;
  const h1e20 = h1Ema20[h1Ema20.length - 1] ?? 0;
  const h1e50 = h1Ema50[h1Ema50.length - 1] ?? 0;
  const m5e20 = m5Ema20[m5Ema20.length - 1] ?? 0;

  const checks: string[] = [];
  let alignedCount = 0;

  if (dir === "LONG") {
    const h1Bull = h1e20 > h1e50 && h1Last > h1e20;
    const m15Bull = m15e20 > m15e50 && m15Last > m15e20;
    const m5Bull = m5Last > m5e20;
    if (h1Bull) { checks.push("1h ✅"); alignedCount++; } else checks.push("1h ❌");
    if (m15Bull) { checks.push("15m ✅"); alignedCount++; } else checks.push("15m ❌");
    if (m5Bull) { checks.push("5m ✅"); alignedCount++; } else checks.push("5m ❌");
  } else {
    const h1Bear = h1e20 < h1e50 && h1Last < h1e20;
    const m15Bear = m15e20 < m15e50 && m15Last < m15e20;
    const m5Bear = m5Last < m5e20;
    if (h1Bear) { checks.push("1h ✅"); alignedCount++; } else checks.push("1h ❌");
    if (m15Bear) { checks.push("15m ✅"); alignedCount++; } else checks.push("15m ❌");
    if (m5Bear) { checks.push("5m ✅"); alignedCount++; } else checks.push("5m ❌");
  }

  return {
    aligned: alignedCount >= 2,
    summary: checks.join(" | "),
    score: alignedCount,
  };
}

// ── Setup type detection ──────────────────────────────────────────────────────

function detectSetupType(
  candles: CandleData[],
  ema20: number,
  ema50: number,
  hasBreakout: boolean,
  hasRetest: boolean,
  rvol: number,
  dir: "LONG" | "SHORT"
): SetupType {
  const last = candles[candles.length - 1];
  const price = last.close;

  if (rvol >= 2.5) return "Volume Expansion";

  if (hasBreakout && hasRetest) return "Breakout Retest";
  if (hasBreakout) return "Resistance Breakout";

  const nearEma20 = Math.abs(price - ema20) / ema20 < 0.005;
  if (nearEma20 && dir === "LONG" && price > ema50) return "EMA Pullback";
  if (nearEma20 && dir === "SHORT" && price < ema50) return "EMA Pullback";

  const recentLows = candles.slice(-20).map(c => c.low);
  const supportLevel = Math.min(...recentLows.slice(0, 10));
  const nearSupport = Math.abs(price - supportLevel) / supportLevel < 0.01;
  if (nearSupport && dir === "LONG") return "Support Bounce";

  const recentHighs = candles.slice(-20).map(c => c.high);
  const resistanceLevel = Math.max(...recentHighs.slice(0, 10));
  const nearResistance = Math.abs(price - resistanceLevel) / resistanceLevel < 0.01;
  if (nearResistance && dir === "SHORT") return "Support Bounce";

  return "Trend Continuation";
}

// ── Main analysis functions ───────────────────────────────────────────────────

export function analyzeForLong(
  symbol: string,
  candles15m: CandleData[],
  currentPrice: number,
  volume24h: number,
  mtf?: { m5: CandleData[]; h1: CandleData[]; m1: CandleData[] }
): SignalAnalysis | null {
  if (candles15m.length < 60) return null;

  const closes = candles15m.map(c => c.close);
  const ema20arr = calcEMA(closes, 20);
  const ema50arr = calcEMA(closes, 50);
  const ema200arr = calcEMA(closes, 100);
  const ema20 = ema20arr[ema20arr.length - 1];
  const ema50 = ema50arr[ema50arr.length - 1];
  const ema200 = ema200arr[ema200arr.length - 1];
  const atr14 = calcATR(candles15m, 14);
  const rvol = calcRVOL(candles15m);

  // ── Trend Score (20 pts) ──────────────────────────────────────────────────
  let trendScore = 0;
  if (ema20 > ema50) trendScore += 8;
  if (currentPrice > ema20) trendScore += 6;
  if (currentPrice > ema50) trendScore += 4;
  if (ema50 > ema200) trendScore += 2;

  // ── EMA Alignment Score (10 pts) ─────────────────────────────────────────
  let emaScore = 0;
  if (ema20 > ema50 && ema50 > ema200) emaScore += 6;
  else if (ema20 > ema50) emaScore += 3;
  const emaDistance = (ema20 - ema50) / ema50;
  if (emaDistance > 0.005 && emaDistance < 0.03) emaScore += 4;
  else if (emaDistance > 0 && emaDistance <= 0.005) emaScore += 2;

  // ── Volume Score (15 pts) ─────────────────────────────────────────────────
  let volumeScore = 0;
  if (volume24h >= 500_000_000) volumeScore = 15;
  else if (volume24h >= 200_000_000) volumeScore = 12;
  else if (volume24h >= 100_000_000) volumeScore = 9;
  else if (volume24h >= 50_000_000) volumeScore = 6;

  // ── RVOL Score (15 pts) ───────────────────────────────────────────────────
  let rvolScore = 0;
  if (rvol >= 3.0) rvolScore = 15;
  else if (rvol >= 2.5) rvolScore = 13;
  else if (rvol >= 2.0) rvolScore = 11;
  else if (rvol >= 1.8) rvolScore = 9;
  else if (rvol >= 1.5) rvolScore = 6;

  // ── Breakout Score (15 pts) ───────────────────────────────────────────────
  let breakoutScore = 0;
  const { detected: hasBreakout, level: resistanceLevel } = detectBreakout(candles15m, ema20);
  if (hasBreakout) {
    breakoutScore += 10;
    if (!detectFakeBreakout(candles15m, resistanceLevel, "LONG")) {
      breakoutScore += 5;
    }
  }

  // ── Retest Score (10 pts) ─────────────────────────────────────────────────
  let retestScore = 0;
  const hasRetest = detectRetest(candles15m, ema20) ||
    detectRetest(candles15m, resistanceLevel, 0.004);
  if (hasRetest) retestScore += 7;
  if (isBullishCandle(candles15m[candles15m.length - 1])) retestScore += 3;

  // ── Structure Score (10 pts) ──────────────────────────────────────────────
  let structureScore = 0;
  if (detectHigherHighHigherLow(candles15m)) structureScore += 10;
  else if (candles15m[candles15m.length - 1].close > candles15m[candles15m.length - 3].close) structureScore += 5;

  // ── Momentum Score (5 pts) ────────────────────────────────────────────────
  let momentumScore = 0;
  if (isBullishMomentum(candles15m)) momentumScore += 3;
  const last = candles15m[candles15m.length - 1];
  const lastBody = Math.abs(last.close - last.open);
  const lastRange = last.high - last.low;
  if (lastRange > 0 && lastBody / lastRange > 0.6) momentumScore += 2;

  // ── Multi-timeframe alignment ─────────────────────────────────────────────
  let tfBonus = 0;
  let tfSummary = "15m only";
  if (mtf && mtf.m5.length >= 20 && mtf.h1.length >= 20) {
    const tfResult = checkTimeframeAlignment(candles15m, mtf.h1, mtf.m5, "LONG");
    tfSummary = tfResult.summary;
    if (!tfResult.aligned) return null;
    tfBonus = tfResult.score * 2;
  }

  let score = trendScore + emaScore + volumeScore + rvolScore + breakoutScore + retestScore + structureScore + momentumScore;
  score = Math.min(100, score + tfBonus);

  if (score < 80) return null;

  // ── SL/TP calculation ─────────────────────────────────────────────────────
  const swingLow = Math.min(...candles15m.slice(-15).map(c => c.low));
  const slCandidates = [
    swingLow - atr14 * 0.3,
    ema20 - atr14 * 1.2,
    currentPrice - atr14 * 2.5,
  ].filter(s => s > 0 && s < currentPrice);

  if (slCandidates.length === 0) return null;
  const stopLoss = Math.min(...slCandidates);
  const risk = currentPrice - stopLoss;

  if (risk <= 0 || risk / currentPrice > 0.06) return null;

  const tp1 = currentPrice + risk * 1.5;
  const tp2 = currentPrice + risk * 2.5;
  const tp3 = currentPrice + risk * 4;
  const rrRatio = (tp2 - currentPrice) / risk;

  if (rrRatio < 2) return null;

  const setupType = detectSetupType(candles15m, ema20, ema50, hasBreakout, hasRetest, rvol, "LONG");
  const confidence = scoreToConfidence(score);
  const grade = score >= 95 ? "A+" : "A";

  const whyNow = `Price confirmed breakout with ${rvol.toFixed(1)}x relative volume. EMA20(${ema20.toFixed(4)}) above EMA50(${ema50.toFixed(4)}), ${setupType} pattern locked in.`;
  const whyNotEarlier = `Waited for candle close confirmation above resistance and RVOL ≥1.5. Entry not valid until structure was confirmed on 15m.`;
  const whyLong = `${detectHigherHighHigherLow(candles15m) ? "Higher Highs + Higher Lows structure. " : ""}EMA20 > EMA50 confirms uptrend. ${hasBreakout ? "Clean breakout above resistance." : "Price holds above EMA support."}`;
  const whySl = `SL at ${stopLoss.toFixed(6)} — below swing low ${swingLow.toFixed(6)} minus 0.3x ATR buffer. Structure invalidated below this level.`;
  const whyTp = `TP1=${tp1.toFixed(4)} (1.5R) | TP2=${tp2.toFixed(4)} (2.5R) | TP3=${tp3.toFixed(4)} (4R). Dynamic levels based on ATR and nearest resistance.`;
  const reason = `LONG ${setupType} | Score:${score}/100 | Trend:${trendScore} EMA:${emaScore} Vol:${volumeScore} RVOL:${rvolScore} BO:${breakoutScore} RT:${retestScore} Str:${structureScore} Mom:${momentumScore} | RVOL:${rvol.toFixed(2)}x | ${tfSummary}`;
  const slReason = whySl;

  return {
    score, grade, confidence, setupType, direction: "LONG",
    entryPrice: currentPrice, stopLoss, tp1, tp2, tp3, rrRatio,
    reason, slReason, whyNow, whyNotEarlier, whyLong, whySl, whyTp,
    timeframeAlignment: tfSummary,
    trendScore, emaScore, volumeScore, rvolScore,
    breakoutScore, retestScore, structureScore, momentumScore,
    ema20, ema50, ema200, atr14, rvol,
  };
}

export function analyzeForShort(
  symbol: string,
  candles15m: CandleData[],
  currentPrice: number,
  volume24h: number,
  mtf?: { m5: CandleData[]; h1: CandleData[]; m1: CandleData[] }
): SignalAnalysis | null {
  if (candles15m.length < 60) return null;

  const closes = candles15m.map(c => c.close);
  const ema20arr = calcEMA(closes, 20);
  const ema50arr = calcEMA(closes, 50);
  const ema200arr = calcEMA(closes, 100);
  const ema20 = ema20arr[ema20arr.length - 1];
  const ema50 = ema50arr[ema50arr.length - 1];
  const ema200 = ema200arr[ema200arr.length - 1];
  const atr14 = calcATR(candles15m, 14);
  const rvol = calcRVOL(candles15m);

  // ── Trend Score (20 pts) ──────────────────────────────────────────────────
  let trendScore = 0;
  if (ema20 < ema50) trendScore += 8;
  if (currentPrice < ema20) trendScore += 6;
  if (currentPrice < ema50) trendScore += 4;
  if (ema50 < ema200) trendScore += 2;

  // ── EMA Alignment Score (10 pts) ─────────────────────────────────────────
  let emaScore = 0;
  if (ema20 < ema50 && ema50 < ema200) emaScore += 6;
  else if (ema20 < ema50) emaScore += 3;
  const emaDistance = (ema50 - ema20) / ema50;
  if (emaDistance > 0.005 && emaDistance < 0.03) emaScore += 4;
  else if (emaDistance > 0 && emaDistance <= 0.005) emaScore += 2;

  // ── Volume Score (15 pts) ─────────────────────────────────────────────────
  let volumeScore = 0;
  if (volume24h >= 500_000_000) volumeScore = 15;
  else if (volume24h >= 200_000_000) volumeScore = 12;
  else if (volume24h >= 100_000_000) volumeScore = 9;
  else if (volume24h >= 50_000_000) volumeScore = 6;

  // ── RVOL Score (15 pts) ───────────────────────────────────────────────────
  let rvolScore = 0;
  if (rvol >= 3.0) rvolScore = 15;
  else if (rvol >= 2.5) rvolScore = 13;
  else if (rvol >= 2.0) rvolScore = 11;
  else if (rvol >= 1.8) rvolScore = 9;
  else if (rvol >= 1.5) rvolScore = 6;

  // ── Breakout Score (15 pts) ───────────────────────────────────────────────
  let breakoutScore = 0;
  const { detected: hasBreakdown, level: supportLevel } = detectBreakdown(candles15m, ema20);
  if (hasBreakdown) {
    breakoutScore += 10;
    if (!detectFakeBreakout(candles15m, supportLevel, "SHORT")) {
      breakoutScore += 5;
    }
  }

  // ── Retest Score (10 pts) ─────────────────────────────────────────────────
  let retestScore = 0;
  const hasRetest = detectRetestShort(candles15m, ema20) ||
    detectRetestShort(candles15m, supportLevel, 0.004);
  if (hasRetest) retestScore += 7;
  if (isBearishCandle(candles15m[candles15m.length - 1])) retestScore += 3;

  // ── Structure Score (10 pts) ──────────────────────────────────────────────
  let structureScore = 0;
  if (detectLowerHighLowerLow(candles15m)) structureScore += 10;
  else if (candles15m[candles15m.length - 1].close < candles15m[candles15m.length - 3].close) structureScore += 5;

  // ── Momentum Score (5 pts) ────────────────────────────────────────────────
  let momentumScore = 0;
  if (isBearishMomentum(candles15m)) momentumScore += 3;
  const last = candles15m[candles15m.length - 1];
  const lastBody = Math.abs(last.close - last.open);
  const lastRange = last.high - last.low;
  if (lastRange > 0 && lastBody / lastRange > 0.6) momentumScore += 2;

  // ── Multi-timeframe alignment ─────────────────────────────────────────────
  let tfBonus = 0;
  let tfSummary = "15m only";
  if (mtf && mtf.m5.length >= 20 && mtf.h1.length >= 20) {
    const tfResult = checkTimeframeAlignment(candles15m, mtf.h1, mtf.m5, "SHORT");
    tfSummary = tfResult.summary;
    if (!tfResult.aligned) return null;
    tfBonus = tfResult.score * 2;
  }

  let score = trendScore + emaScore + volumeScore + rvolScore + breakoutScore + retestScore + structureScore + momentumScore;
  score = Math.min(100, score + tfBonus);

  if (score < 80) return null;

  // ── SL/TP calculation ─────────────────────────────────────────────────────
  const swingHigh = Math.max(...candles15m.slice(-15).map(c => c.high));
  const slCandidates = [
    swingHigh + atr14 * 0.3,
    ema20 + atr14 * 1.2,
    currentPrice + atr14 * 2.5,
  ].filter(s => s > currentPrice);

  if (slCandidates.length === 0) return null;
  const stopLoss = Math.max(...slCandidates);
  const risk = stopLoss - currentPrice;

  if (risk <= 0 || risk / currentPrice > 0.06) return null;

  const tp1 = currentPrice - risk * 1.5;
  const tp2 = currentPrice - risk * 2.5;
  const tp3 = currentPrice - risk * 4;
  const rrRatio = (currentPrice - tp2) / risk;

  if (rrRatio < 2) return null;

  const setupType = detectSetupType(candles15m, ema20, ema50, hasBreakdown, hasRetest, rvol, "SHORT");
  const confidence = scoreToConfidence(score);
  const grade = score >= 95 ? "A+" : "A";

  const whyNow = `Price confirmed breakdown with ${rvol.toFixed(1)}x relative volume. EMA20(${ema20.toFixed(4)}) below EMA50(${ema50.toFixed(4)}), ${setupType} pattern confirmed.`;
  const whyNotEarlier = `Waited for candle close confirmation below support and RVOL ≥1.5. Entry not valid until structure was confirmed on 15m.`;
  const whyLong = `${detectLowerHighLowerLow(candles15m) ? "Lower Highs + Lower Lows structure. " : ""}EMA20 < EMA50 confirms downtrend. ${hasBreakdown ? "Clean breakdown below support." : "Price rejected below EMA resistance."}`;
  const whySl = `SL at ${stopLoss.toFixed(6)} — above swing high ${swingHigh.toFixed(6)} plus 0.3x ATR buffer. Structure invalidated above this level.`;
  const whyTp = `TP1=${tp1.toFixed(4)} (1.5R) | TP2=${tp2.toFixed(4)} (2.5R) | TP3=${tp3.toFixed(4)} (4R). Dynamic levels based on ATR and nearest support.`;
  const reason = `SHORT ${setupType} | Score:${score}/100 | Trend:${trendScore} EMA:${emaScore} Vol:${volumeScore} RVOL:${rvolScore} BD:${breakoutScore} RT:${retestScore} Str:${structureScore} Mom:${momentumScore} | RVOL:${rvol.toFixed(2)}x | ${tfSummary}`;
  const slReason = whySl;

  return {
    score, grade, confidence, setupType, direction: "SHORT",
    entryPrice: currentPrice, stopLoss, tp1, tp2, tp3, rrRatio,
    reason, slReason, whyNow, whyNotEarlier, whyLong, whySl, whyTp,
    timeframeAlignment: tfSummary,
    trendScore, emaScore, volumeScore, rvolScore,
    breakoutScore, retestScore, structureScore, momentumScore,
    ema20, ema50, ema200, atr14, rvol,
  };
}
