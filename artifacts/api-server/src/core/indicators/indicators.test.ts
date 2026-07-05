import assert from "node:assert/strict";
import test from "node:test";
import {
  adx,
  atr,
  bollingerBands,
  cmf,
  cci,
  detectSwingRange,
  donchianChannel,
  ema,
  fibonacciConfluence,
  fibonacciExtension,
  fibonacciRetracement,
  keltnerChannel,
  macd,
  mfi,
  obv,
  rsi,
  rvol,
  sma,
  stochastic,
  supertrend,
  vwap,
  type IndicatorCandle,
} from "./index";

const candles: IndicatorCandle[] = Array.from({ length: 40 }, (_, index) => {
  const close = 100 + index + Math.sin(index / 2);
  return {
    timestamp: index,
    open: close - 0.6,
    high: close + 1.5,
    low: close - 1.25,
    close,
    volume: 1_000 + index * 50,
  };
});

test("moving averages and VWAP produce aligned indicator series", () => {
  const closes = candles.map((candle) => candle.close);

  assert.equal(sma(closes, 5).length, closes.length);
  assert.equal(sma(closes, 5)[3], null);
  assert.equal(typeof sma(closes, 5)[4], "number");
  assert.equal(ema(closes, 5).length, closes.length);
  assert.equal(vwap(candles).length, candles.length);
  assert.ok((vwap(candles).at(-1) ?? 0) > 0);
});

test("core momentum, volatility, volume, and channel indicators are available", () => {
  const closes = candles.map((candle) => candle.close);

  assert.equal(atr(candles, 14).length, candles.length);
  assert.equal(adx(candles, 14).length, candles.length);
  assert.equal(supertrend(candles, 10).length, candles.length);
  assert.equal(bollingerBands(closes, 20).length, candles.length);
  assert.equal(rsi(closes, 14).length, candles.length);
  assert.equal(macd(closes).length, candles.length);
  assert.equal(stochastic(candles).length, candles.length);
  assert.equal(cci(candles).length, candles.length);
  assert.equal(donchianChannel(candles).length, candles.length);
  assert.equal(keltnerChannel(candles).length, candles.length);
  assert.equal(obv(candles).length, candles.length);
  assert.equal(cmf(candles).length, candles.length);
  assert.equal(mfi(candles).length, candles.length);
  assert.equal(rvol(candles).length, candles.length);
});

test("Fibonacci levels detect a swing range and return confluence only", () => {
  const range = detectSwingRange(candles);
  assert.ok(range);

  const retracement = fibonacciRetracement(range);
  const extension = fibonacciExtension(range);
  assert.ok(retracement.levels["0.618"] > range.swingLow);
  assert.ok(extension.levels["1.618"] > range.swingHigh);

  const confluence = fibonacciConfluence(candles, retracement.levels["0.705"], "LONG");
  assert.ok(confluence);
  assert.equal(confluence.reason.includes("signal"), false);
  assert.ok(confluence.confluenceScore >= 0);
  assert.ok(confluence.confluenceScore <= 5);
});
