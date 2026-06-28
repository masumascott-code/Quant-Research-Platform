import { StrategyEvaluator } from "./StrategyEvaluator";
import type { ParameterCandidate, ParameterOptimizationResult, PerformanceMetrics } from "./types";

export class ParameterOptimizer {
  constructor(private readonly evaluator = new StrategyEvaluator()) {}

  async optimize(
    candidates: ParameterCandidate[],
    evaluateCandidate: (candidate: ParameterCandidate) => Promise<PerformanceMetrics>,
  ): Promise<ParameterOptimizationResult> {
    if (candidates.length === 0) {
      throw new Error("ParameterOptimizer requires at least one candidate");
    }

    const results: ParameterOptimizationResult["results"] = [];
    for (const candidate of candidates) {
      const metrics = await evaluateCandidate(candidate);
      results.push({ candidate, score: this.evaluator.evaluate(metrics).score, metrics });
    }

    const best = [...results].sort((a, b) => b.score - a.score)[0]!;
    return { best: best.candidate, score: best.score, results };
  }
}
