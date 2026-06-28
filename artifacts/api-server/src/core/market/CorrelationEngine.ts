import type { MarketCandle } from "./types";

export class CorrelationEngine {
  correlate(a: MarketCandle[], b: MarketCandle[]): number {
    const av = a.slice(-50).map((c) => c.close);
    const bv = b.slice(-50).map((c) => c.close);
    const length = Math.min(av.length, bv.length);
    if (length < 2) return 0;
    const x = av.slice(-length);
    const y = bv.slice(-length);
    const xMean = x.reduce((sum, value) => sum + value, 0) / length;
    const yMean = y.reduce((sum, value) => sum + value, 0) / length;
    const numerator = x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0);
    const xDen = Math.sqrt(x.reduce((sum, value) => sum + (value - xMean) ** 2, 0));
    const yDen = Math.sqrt(y.reduce((sum, value) => sum + (value - yMean) ** 2, 0));
    return xDen > 0 && yDen > 0 ? numerator / (xDen * yDen) : 0;
  }
}
