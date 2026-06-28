import type { LearningDataset, MarketRegimeOptimization, RegimeFinding } from "./types";

export class MarketRegimeOptimizer {
  optimize(dataset: LearningDataset): MarketRegimeOptimization {
    const buckets = new Map<string, {
      observations: number;
      confidence: number;
      risk: number;
      trend: number;
    }>();

    for (const context of dataset.marketContexts) {
      const bucket = buckets.get(context.marketRegime) ?? {
        observations: 0,
        confidence: 0,
        risk: 0,
        trend: 0,
      };
      bucket.observations += 1;
      bucket.confidence += context.confidence;
      bucket.risk += riskPenalty(context.riskGrade);
      bucket.trend += context.trendScore;
      buckets.set(context.marketRegime, bucket);
    }

    for (const backtest of dataset.backtests) {
      if (!backtest.marketRegime) continue;
      const returnPct = backtest.finalEquity && backtest.initialEquity > 0
        ? ((backtest.finalEquity - backtest.initialEquity) / backtest.initialEquity) * 100
        : 0;
      const bucket = buckets.get(backtest.marketRegime) ?? {
        observations: 0,
        confidence: 0,
        risk: 0,
        trend: 0,
      };
      bucket.observations += 1;
      bucket.confidence += Math.max(0, Math.min(100, 50 + returnPct));
      bucket.risk += returnPct < 0 ? 70 : 30;
      bucket.trend += Math.max(0, Math.min(100, 50 + returnPct));
      buckets.set(backtest.marketRegime, bucket);
    }

    const regimes = [...buckets.entries()].map(([regime, bucket]): RegimeFinding => {
      const avgConfidence = bucket.confidence / bucket.observations;
      const avgRisk = bucket.risk / bucket.observations;
      const avgTrend = bucket.trend / bucket.observations;
      return {
        regime,
        observations: bucket.observations,
        avgConfidence: round(avgConfidence),
        avgRisk: round(avgRisk),
        avgTrend: round(avgTrend),
        suitabilityScore: round((avgConfidence * 0.45) + (avgTrend * 0.35) + ((100 - avgRisk) * 0.2)),
      };
    }).sort((a, b) => b.suitabilityScore - a.suitabilityScore);

    const eligible = regimes.filter((regime) => regime.observations >= 2);

    return {
      bestRegime: eligible[0] ?? regimes[0],
      worstRegime: eligible.at(-1) ?? regimes.at(-1),
      regimes,
    };
  }
}

function riskPenalty(grade: string): number {
  const normalized = grade.toUpperCase();
  if (normalized.includes("LOW") || normalized === "A") return 20;
  if (normalized.includes("MEDIUM") || normalized === "B" || normalized === "C") return 50;
  if (normalized.includes("HIGH") || normalized === "D" || normalized === "F") return 80;
  return 55;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
