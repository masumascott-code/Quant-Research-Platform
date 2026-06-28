import type { PerformanceMetrics } from "./types";

export interface StrategyEvaluation {
  score: number;
  grade: "A" | "B" | "C" | "D";
  reasons: string[];
}

export class StrategyEvaluator {
  evaluate(metrics: PerformanceMetrics): StrategyEvaluation {
    const finiteProfitFactor = Number.isFinite(metrics.profitFactor) ? metrics.profitFactor : 5;
    const finiteSharpe = Number.isFinite(metrics.sharpeRatio) ? metrics.sharpeRatio : 5;
    const finiteCalmar = Number.isFinite(metrics.calmarRatio) ? metrics.calmarRatio : 5;
    const score = this.clamp(
      metrics.winRate * 25 +
      Math.min(finiteProfitFactor, 5) * 12 +
      Math.max(-2, Math.min(finiteSharpe, 5)) * 8 +
      Math.max(-2, Math.min(finiteCalmar, 5)) * 6 +
      Math.max(-2, Math.min(metrics.averageRMultiple, 5)) * 7 -
      metrics.maxDrawdown * 100,
      0,
      100,
    );

    return {
      score,
      grade: score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D",
      reasons: this.reasons(metrics),
    };
  }

  private reasons(metrics: PerformanceMetrics): string[] {
    const reasons: string[] = [];
    if (metrics.tradeCount === 0) reasons.push("No trades generated");
    if (metrics.profitFactor >= 1.5) reasons.push("Profit factor above institutional threshold");
    if (metrics.maxDrawdown > 0.2) reasons.push("Maximum drawdown is elevated");
    if (metrics.expectancy > 0) reasons.push("Positive expectancy");
    if (metrics.averageRMultiple < 0) reasons.push("Negative average R multiple");
    return reasons;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
