import { clamp } from "./indicators";
import type { LiquidityResult, RegimeResult, SessionResult, TrendResult, VolatilityResult, VolumeResult } from "./types";

export class ConfidenceEngine {
  score(input: {
    regime: RegimeResult;
    trend: TrendResult;
    liquidity: LiquidityResult;
    volume: VolumeResult;
    volatility: VolatilityResult;
    session: SessionResult;
    rrRatio?: number;
    signalQuality?: number;
  }): number {
    const regimeScore = input.regime.confidence;
    const rrScore = input.rrRatio == null ? 50 : clamp(input.rrRatio * 25);
    const signalScore = input.signalQuality ?? 50;
    return clamp(
      regimeScore * 0.15 +
      input.trend.score * 0.20 +
      input.liquidity.score * 0.15 +
      input.volume.score * 0.15 +
      input.volatility.score * 0.10 +
      input.session.qualityScore * 0.10 +
      rrScore * 0.075 +
      signalScore * 0.075
    );
  }
}
