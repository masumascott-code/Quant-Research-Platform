import type { ConfidenceCalibration, LearningDataset } from "./types";

export class ConfidenceCalibrator {
  calibrate(dataset: LearningDataset): ConfidenceCalibration {
    const closedTrades = dataset.trades.filter((trade) => trade.status === "closed");
    const avgScore = average(closedTrades.map((trade) => trade.signalScore));
    const lowScoreTrades = closedTrades.filter((trade) => trade.signalScore < 92);
    const highScoreTrades = closedTrades.filter((trade) => trade.signalScore >= 95);
    const lowScoreLossRate = rate(lowScoreTrades, (trade) => trade.result === "LOSS");
    const highScoreWinRate = rate(highScoreTrades, (trade) => trade.result === "WIN");
    const losingLowScores = lowScoreLossRate >= 0.5 && lowScoreTrades.length >= 3;
    const recommendedMinimumScore = losingLowScores ? 94 : highScoreWinRate >= 0.6 ? 92 : 93;

    return {
      currentAverageScore: round(avgScore),
      recommendedMinimumScore,
      lowScoreLossRate: round(lowScoreLossRate),
      highScoreWinRate: round(highScoreWinRate),
      confidence: round(Math.min(100, Math.max(35, closedTrades.length * 4))),
      rationale: losingLowScores
        ? "Lower-score trades show elevated loss frequency; raise the review threshold before approving similar setups."
        : "Current confidence profile is acceptable; threshold changes should remain modest and human-approved.",
    };
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate<T>(values: T[], predicate: (value: T) => boolean): number {
  if (values.length === 0) return 0;
  return values.filter(predicate).length / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
