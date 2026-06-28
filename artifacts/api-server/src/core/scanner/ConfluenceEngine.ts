import { configService } from "../config";
import type { MarketContext } from "../market";
import type { ScoreBreakdown, TechnicalSignalInput } from "./types";

export class ConfluenceEngine {
  calculate(technicalSignal: TechnicalSignalInput, context: MarketContext): ScoreBreakdown {
    const config = configService.getSync().scannerDecision;
    const riskRewardScore = Math.min(100, Math.max(0, technicalSignal.rrRatio * 25));
    const marketRegimeScore = context.marketRegime.confidence;
    const weightedTotal =
      technicalSignal.score * config.technicalWeight +
      marketRegimeScore * config.marketRegimeWeight +
      context.liquidityScore * config.liquidityWeight +
      context.volumeScore * config.volumeWeight +
      context.trendScore * config.trendWeight +
      context.volatilityScore * config.volatilityWeight +
      context.session.qualityScore * config.sessionWeight +
      riskRewardScore * config.riskRewardWeight;
    const weightSum =
      config.technicalWeight +
      config.marketRegimeWeight +
      config.liquidityWeight +
      config.volumeWeight +
      config.trendWeight +
      config.volatilityWeight +
      config.sessionWeight +
      config.riskRewardWeight;

    return {
      finalScore: weightSum > 0 ? weightedTotal / weightSum : technicalSignal.score,
      technicalScore: technicalSignal.score,
      marketRegimeScore,
      liquidityScore: context.liquidityScore,
      volumeScore: context.volumeScore,
      trendScore: context.trendScore,
      volatilityScore: context.volatilityScore,
      sessionScore: context.session.qualityScore,
      riskRewardScore,
      weights: {
        technicalWeight: config.technicalWeight,
        marketRegimeWeight: config.marketRegimeWeight,
        liquidityWeight: config.liquidityWeight,
        volumeWeight: config.volumeWeight,
        trendWeight: config.trendWeight,
        volatilityWeight: config.volatilityWeight,
        sessionWeight: config.sessionWeight,
        riskRewardWeight: config.riskRewardWeight,
      },
    };
  }
}
