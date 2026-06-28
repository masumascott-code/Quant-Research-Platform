import { clamp, sma } from "./indicators";
import type { MarketCandle, VolumeResult } from "./types";

export class VolumeProfileEngine {
  analyze(candles: MarketCandle[]): VolumeResult {
    if (candles.length < 2) {
      return { relativeVolume: 1, volumeSpike: false, deltaApproximation: 0, volumeExpansion: false, volumeContraction: false, buyingPressure: 0, sellingPressure: 0, score: 0 };
    }

    const volumes = candles.map((c) => c.volume);
    const current = volumes[volumes.length - 1];
    const average = sma(volumes.slice(0, -1), Math.min(20, volumes.length - 1));
    const relativeVolume = average > 0 ? current / average : 1;
    const last = candles[candles.length - 1];
    const range = Math.max(last.high - last.low, 0);
    const buyingPressure = range > 0 ? clamp(((last.close - last.low) / range) * 100) : 50;
    const sellingPressure = 100 - buyingPressure;
    const deltaApproximation = last.close >= last.open ? current * (buyingPressure / 100) : -current * (sellingPressure / 100);
    const volumeSpike = relativeVolume >= 2;
    const volumeExpansion = relativeVolume >= 1.25;
    const volumeContraction = relativeVolume <= 0.75;
    const score = clamp(relativeVolume * 30 + Math.max(buyingPressure, sellingPressure) * 0.4);

    return { relativeVolume, volumeSpike, deltaApproximation, volumeExpansion, volumeContraction, buyingPressure, sellingPressure, score };
  }
}
