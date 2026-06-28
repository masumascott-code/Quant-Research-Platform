import type { LearningDataset, StrategyFinding, StrategyOptimization } from "./types";

export class StrategyOptimizer {
  optimize(dataset: LearningDataset): StrategyOptimization {
    const findings = dataset.setupStats.map((stat): StrategyFinding => {
      const sampleConfidence = Math.min(1, stat.totalTrades / 20);
      const performanceScore = (stat.winRate * 55) + normalizePnl(stat.avgPnl) * 30 + (stat.avgScore / 100) * 15;

      return {
        strategy: stat.setupType,
        direction: stat.direction,
        totalTrades: stat.totalTrades,
        winRate: stat.winRate,
        avgPnl: stat.avgPnl,
        avgScore: stat.avgScore,
        confidence: round(sampleConfidence * 100),
        rationale: `${stat.setupType} ${stat.direction} has ${(stat.winRate * 100).toFixed(1)}% win rate across ${stat.totalTrades} trades.`,
        ...{ performanceScore },
      } as StrategyFinding & { performanceScore: number };
    });

    const ranked = [...findings].sort((a, b) =>
      (b as StrategyFinding & { performanceScore: number }).performanceScore -
      (a as StrategyFinding & { performanceScore: number }).performanceScore,
    );
    const strongStrategies = ranked
      .filter((finding) => finding.totalTrades >= 3 && finding.winRate >= 0.55 && finding.avgPnl >= 0)
      .map(stripScore);
    const weakStrategies = [...ranked]
      .reverse()
      .filter((finding) => finding.totalTrades >= 3 && (finding.winRate < 0.45 || finding.avgPnl < 0))
      .map(stripScore);
    const winRates = findings.filter((finding) => finding.totalTrades > 0).map((finding) => finding.winRate);
    const consistencyScore = winRates.length > 1 ? round(100 - standardDeviation(winRates) * 100) : 50;

    return {
      strongStrategies,
      weakStrategies,
      preferredStrategy: strongStrategies[0],
      avoidedStrategy: weakStrategies[0],
      consistencyScore: Math.max(0, Math.min(100, consistencyScore)),
    };
  }
}

function stripScore(finding: StrategyFinding & { performanceScore?: number }): StrategyFinding {
  const { performanceScore: _performanceScore, ...rest } = finding;
  return rest;
}

function normalizePnl(value: number): number {
  return Math.max(0, Math.min(1, (value + 10) / 20));
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
