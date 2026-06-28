import type { LearningDataset, MistakeAnalysis, MistakePattern } from "./types";

export class MistakeAnalyzer {
  analyze(dataset: LearningDataset): MistakeAnalysis {
    const repeatedMistakes = this.detectRepeatedMistakes(dataset);
    const highRiskBehaviours = this.detectHighRiskBehaviour(dataset);
    const penalty = [...repeatedMistakes, ...highRiskBehaviours]
      .reduce((sum, pattern) => sum + Math.min(pattern.severity * pattern.count, 35), 0);
    const traderDisciplineScore = clampScore(100 - penalty);

    return {
      repeatedMistakes,
      highRiskBehaviours,
      traderDisciplineScore,
      summary: repeatedMistakes.length === 0 && highRiskBehaviours.length === 0
        ? "No repeated mistakes detected in the current lookback window."
        : `${repeatedMistakes.length} repeated mistake patterns and ${highRiskBehaviours.length} high-risk behaviours detected.`,
    };
  }

  private detectRepeatedMistakes(dataset: LearningDataset): MistakePattern[] {
    const counts = new Map<string, MistakePattern>();

    for (const review of dataset.tradeReviews) {
      const text = [
        review.analysisReason,
        review.improvementNotes ?? "",
        review.losingFactors ?? "",
        review.lessonsLearned,
      ].join(" ").toLowerCase();

      if (review.result === "LOSS" || review.setupQuality === "poor" || review.setupQuality === "average") {
        this.addPattern(counts, "loss_review", "Repeated loss reviews", 4, review.analysisReason);
      }
      if (text.includes("score") && text.match(/90|91|92|93|94|lower end|threshold/)) {
        this.addPattern(counts, "borderline_score", "Borderline signal quality", 5, review.improvementNotes ?? review.analysisReason);
      }
      if (text.includes("market context") || text.includes("conditions shifted") || text.includes("news")) {
        this.addPattern(counts, "context_shift", "Market context changed after entry", 6, review.improvementNotes ?? review.analysisReason);
      }
      if (text.includes("hold") || text.includes("trailing") || text.includes("reversed")) {
        this.addPattern(counts, "exit_management", "Exit management inconsistency", 4, review.improvementNotes ?? review.lessonsLearned);
      }
    }

    return [...counts.values()]
      .filter((pattern) => pattern.count >= 2)
      .sort((a, b) => b.severity * b.count - a.severity * a.count);
  }

  private detectHighRiskBehaviour(dataset: LearningDataset): MistakePattern[] {
    const patterns = new Map<string, MistakePattern>();
    const closedTrades = dataset.trades.filter((trade) => trade.status === "closed");
    const lowScoreLosses = closedTrades.filter((trade) =>
      trade.result === "LOSS" && trade.signalScore < 92,
    );
    const largeDrawdowns = closedTrades.filter((trade) =>
      Math.abs(trade.maxDrawdown ?? 0) >= 3 || (trade.pnlPercent ?? 0) <= -2,
    );
    const highPortfolioRisk = dataset.portfolioMetrics.filter((metric) => metric.riskUsagePercent >= 70);
    const poorFills = dataset.executionMetrics.filter((metric) =>
      metric.fillRatio < 0.95 || metric.executionDelayMs > 2_000 || Math.abs(metric.entrySlippage + metric.exitSlippage) / 2 > 0.0025,
    );

    if (lowScoreLosses.length >= 2) {
      this.addPattern(patterns, "low_score_losses", "Losses from lower-confidence setups", 7, `${lowScoreLosses.length} losses below 92 signal score`);
      patterns.get("low_score_losses")!.count = lowScoreLosses.length;
    }

    if (largeDrawdowns.length >= 2) {
      this.addPattern(patterns, "large_drawdown", "Large drawdown tolerance", 8, `${largeDrawdowns.length} trades exceeded drawdown guardrails`);
      patterns.get("large_drawdown")!.count = largeDrawdowns.length;
    }

    if (highPortfolioRisk.length > 0) {
      this.addPattern(patterns, "portfolio_risk_usage", "Elevated portfolio risk usage", 8, `Risk usage reached ${Math.max(...highPortfolioRisk.map((m) => m.riskUsagePercent)).toFixed(1)}%`);
      patterns.get("portfolio_risk_usage")!.count = highPortfolioRisk.length;
    }

    if (poorFills.length >= 3) {
      this.addPattern(patterns, "execution_quality", "Poor execution quality", 5, `${poorFills.length} executions had delayed, slipped, or partial fills`);
      patterns.get("execution_quality")!.count = poorFills.length;
    }

    return [...patterns.values()].sort((a, b) => b.severity * b.count - a.severity * a.count);
  }

  private addPattern(
    counts: Map<string, MistakePattern>,
    key: string,
    label: string,
    severity: number,
    evidence: string,
  ) {
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.evidence.length < 5) existing.evidence.push(evidence);
      return;
    }
    counts.set(key, { key, label, count: 1, severity, evidence: [evidence] });
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}
