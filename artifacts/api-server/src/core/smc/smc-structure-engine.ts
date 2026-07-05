import type { HtfBias, SmcCandle, SmcDirection, StructureEvent, SwingPoint } from "./types";

export function detectSwingHighs(candles: SmcCandle[], left = 2, right = 2): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const candle = candles[i];
    const before = candles.slice(i - left, i);
    const after = candles.slice(i + 1, i + right + 1);
    if (before.every((c) => candle.high > c.high) && after.every((c) => candle.high >= c.high)) {
      const localLow = Math.min(...candles.slice(i - left, i + right + 1).map((c) => c.low));
      swings.push({
        type: "high",
        index: i,
        time: candle.timestamp,
        price: candle.high,
        strength: scoreSwing(candle.high - localLow, candle.close),
      });
    }
  }
  return swings;
}

export function detectSwingLows(candles: SmcCandle[], left = 2, right = 2): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const candle = candles[i];
    const before = candles.slice(i - left, i);
    const after = candles.slice(i + 1, i + right + 1);
    if (before.every((c) => candle.low < c.low) && after.every((c) => candle.low <= c.low)) {
      const localHigh = Math.max(...candles.slice(i - left, i + right + 1).map((c) => c.high));
      swings.push({
        type: "low",
        index: i,
        time: candle.timestamp,
        price: candle.low,
        strength: scoreSwing(localHigh - candle.low, candle.close),
      });
    }
  }
  return swings;
}

export function detectStructureEvents(candles: SmcCandle[], left = 2, right = 2): StructureEvent[] {
  const swings = [...detectSwingHighs(candles, left, right), ...detectSwingLows(candles, left, right)]
    .sort((a, b) => a.index - b.index);
  const events: StructureEvent[] = [];
  let lastDirection: SmcDirection | null = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const priorSwings = swings.filter((s) => s.index < i);
    const lastHigh = [...priorSwings].reverse().find((s) => s.type === "high");
    const lastLow = [...priorSwings].reverse().find((s) => s.type === "low");

    if (lastHigh && candle.close > lastHigh.price) {
      const direction: SmcDirection = "bullish";
      events.push({
        type: lastDirection === "bearish" ? "CHOCH" : events.length === 0 ? "MSS" : "BOS",
        direction,
        index: i,
        time: candle.timestamp,
        brokenLevel: lastHigh.price,
        confirmationClose: candle.close,
        strength: scoreBreak(candle.close, lastHigh.price, candle.high - candle.low),
      });
      lastDirection = direction;
    }

    if (lastLow && candle.close < lastLow.price) {
      const direction: SmcDirection = "bearish";
      events.push({
        type: lastDirection === "bullish" ? "CHOCH" : events.length === 0 ? "MSS" : "BOS",
        direction,
        index: i,
        time: candle.timestamp,
        brokenLevel: lastLow.price,
        confirmationClose: candle.close,
        strength: scoreBreak(lastLow.price, candle.close, candle.high - candle.low),
      });
      lastDirection = direction;
    }
  }

  return dedupeConsecutiveBreaks(events);
}

export function detectHtfBias(candles: SmcCandle[]): HtfBias {
  if (candles.length < 20) return "neutral";
  const highs = detectSwingHighs(candles, 2, 2).slice(-4);
  const lows = detectSwingLows(candles, 2, 2).slice(-4);
  const events = detectStructureEvents(candles, 2, 2).slice(-3);
  const lastEvent = events[events.length - 1];

  const risingSwings = highs.length >= 2 && lows.length >= 2
    && highs[highs.length - 1].price > highs[highs.length - 2].price
    && lows[lows.length - 1].price > lows[lows.length - 2].price;
  const fallingSwings = highs.length >= 2 && lows.length >= 2
    && highs[highs.length - 1].price < highs[highs.length - 2].price
    && lows[lows.length - 1].price < lows[lows.length - 2].price;

  if (lastEvent?.direction === "bullish" || risingSwings) return "bullish";
  if (lastEvent?.direction === "bearish" || fallingSwings) return "bearish";
  return "neutral";
}

function scoreSwing(range: number, price: number): number {
  if (price <= 0) return 40;
  return Math.max(30, Math.min(100, (range / price) * 4000));
}

function scoreBreak(close: number, level: number, range: number): number {
  if (range <= 0) return 50;
  return Math.max(40, Math.min(100, (Math.abs(close - level) / range) * 140));
}

function dedupeConsecutiveBreaks(events: StructureEvent[]): StructureEvent[] {
  const deduped: StructureEvent[] = [];
  for (const event of events) {
    const previous = deduped[deduped.length - 1];
    if (
      previous
      && previous.direction === event.direction
      && previous.type === event.type
      && Math.abs(previous.brokenLevel - event.brokenLevel) / event.brokenLevel < 0.001
    ) {
      if (event.strength > previous.strength) deduped[deduped.length - 1] = event;
      continue;
    }
    deduped.push(event);
  }
  return deduped;
}
