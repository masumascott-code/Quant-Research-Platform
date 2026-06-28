import { ConfidenceCalibrator } from "./ConfidenceCalibrator";
import { LearningRepository } from "./LearningRepository";
import { MarketRegimeOptimizer } from "./MarketRegimeOptimizer";
import { MistakeAnalyzer } from "./MistakeAnalyzer";
import { SessionOptimizer } from "./SessionOptimizer";
import { StrategyOptimizer } from "./StrategyOptimizer";
import { ThresholdAdvisor } from "./ThresholdAdvisor";
import type {
  AdaptiveLearningResult,
  EdgeScores,
  ImprovementTimelinePoint,
  LearningDataset,
  LearningRecommendation,
  LearningReport,
  StrategyEvolutionPoint,
} from "./types";

export class AdaptiveLearningEngine {
  constructor(
    private readonly repository = new LearningRepository(),
    private readonly mistakeAnalyzer = new MistakeAnalyzer(),
    private readonly strategyOptimizer = new StrategyOptimizer(),
    private readonly confidenceCalibrator = new ConfidenceCalibrator(),
    private readonly sessionOptimizer = new SessionOptimizer(),
    private readonly marketRegimeOptimizer = new MarketRegimeOptimizer(),
    private readonly thresholdAdvisor = new ThresholdAdvisor(),
  ) {}

  async run(params: { lookbackDays?: number; persist?: boolean } = {}): Promise<AdaptiveLearningResult> {
    const lookbackDays = params.lookbackDays ?? 30;
    const persist = params.persist ?? true;
    const dataset = await this.repository.loadDataset({ lookbackDays });

    const mistakeAnalysis = this.mistakeAnalyzer.analyze(dataset);
    const strategyOptimization = this.strategyOptimizer.optimize(dataset);
    const confidenceCalibration = this.confidenceCalibrator.calibrate(dataset);
    const sessionOptimization = this.sessionOptimizer.optimize(dataset);
    const marketRegimeOptimization = this.marketRegimeOptimizer.optimize(dataset);
    const recommendations = this.thresholdAdvisor.recommend({
      dataset,
      mistakes: mistakeAnalysis,
      strategies: strategyOptimization,
      confidence: confidenceCalibration,
      sessions: sessionOptimization,
      regimes: marketRegimeOptimization,
    });
    const scores = this.generateScores({
      dataset,
      traderDisciplineScore: mistakeAnalysis.traderDisciplineScore,
      consistencyScore: strategyOptimization.consistencyScore,
      recommendationCount: recommendations.length,
    });
    const timeline = await this.safeTimeline(scores);
    const strategyEvolution = this.strategyEvolution(dataset);
    const result: AdaptiveLearningResult = {
      runId: `adaptive-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      lookbackDays,
      scores,
      mistakeAnalysis,
      strategyOptimization,
      confidenceCalibration,
      sessionOptimization,
      marketRegimeOptimization,
      recommendations,
      weeklyReport: this.generateReport("WEEKLY", scores, recommendations, dataset),
      monthlyReport: this.generateReport("MONTHLY", scores, recommendations, dataset),
      improvementTimeline: timeline,
      strategyEvolution,
      edgeEvolution: timeline,
      persisted: false,
      advisoryOnly: true,
    };

    if (persist) {
      await this.repository.persistResult(result);
      result.persisted = true;
    }

    return result;
  }

  generateScores(params: {
    dataset: LearningDataset;
    traderDisciplineScore: number;
    consistencyScore: number;
    recommendationCount: number;
  }): EdgeScores {
    const closedTrades = params.dataset.trades.filter((trade) => trade.status === "closed");
    const winRate = rate(closedTrades, (trade) => trade.result === "WIN");
    const avgPnl = average(closedTrades.map((trade) => trade.pnl));
    const researchScore = average(params.dataset.performanceMetrics.map((metric) =>
      (metric.winRate * 40) + Math.min(metric.profitFactor, 3) * 15 + Math.max(-20, Math.min(20, metric.totalReturn)) + 25,
    ));
    const executionScore = 100 - Math.min(60, executionFriction(params.dataset) * 100);
    const improvementScore = clampScore((winRate * 35) + normalizePnl(avgPnl) * 25 + researchScore * 0.25 + executionScore * 0.15);
    const learningScore = clampScore(40 + params.recommendationCount * 5 + params.dataset.tradeReviews.length * 1.5);
    const edgeScore = clampScore((improvementScore * 0.4) + (params.consistencyScore * 0.25) + (params.traderDisciplineScore * 0.2) + (executionScore * 0.15));

    return {
      improvementScore: round(improvementScore),
      learningScore: round(learningScore),
      edgeScore: round(edgeScore),
      traderDisciplineScore: round(params.traderDisciplineScore),
      consistencyScore: round(params.consistencyScore),
      components: {
        winRate: round(winRate * 100),
        avgPnl: round(avgPnl),
        researchScore: round(researchScore),
        executionScore: round(executionScore),
      },
    };
  }

  generateReport(
    period: "WEEKLY" | "MONTHLY",
    scores: EdgeScores,
    recommendations: LearningRecommendation[],
    dataset: LearningDataset,
  ): LearningReport {
    const strongestEdges = [
      bestText("Best session", dataset.marketContexts[0]?.session),
      bestText("Most consistent score", `${scores.consistencyScore.toFixed(1)}`),
      bestText("Discipline", `${scores.traderDisciplineScore.toFixed(1)}`),
    ].filter(Boolean);
    const weakestEdges = recommendations
      .slice(0, 5)
      .map((recommendation) => `${recommendation.category}: ${recommendation.rationale}`);

    return {
      title: `${period === "WEEKLY" ? "Weekly" : "Monthly"} Learning Report`,
      period,
      summary: `${period} adaptive review produced ${recommendations.length} human-approval recommendations. No configuration was changed automatically.`,
      scores,
      strongestEdges,
      weakestEdges,
      recommendations,
    };
  }

  private async safeTimeline(current: EdgeScores): Promise<ImprovementTimelinePoint[]> {
    try {
      const previous = await this.repository.improvementTimeline();
      return [
        ...previous,
        {
          date: new Date().toISOString(),
          improvementScore: current.improvementScore,
          learningScore: current.learningScore,
          edgeScore: current.edgeScore,
        },
      ].slice(-12);
    } catch {
      return [{
        date: new Date().toISOString(),
        improvementScore: current.improvementScore,
        learningScore: current.learningScore,
        edgeScore: current.edgeScore,
      }];
    }
  }

  private strategyEvolution(dataset: LearningDataset): StrategyEvolutionPoint[] {
    return dataset.setupStats.map((stat) => ({
      strategy: `${stat.setupType} ${stat.direction}`,
      winRate: stat.winRate,
      avgPnl: stat.avgPnl,
      totalTrades: stat.totalTrades,
    }));
  }
}

function bestText(label: string, value?: string): string {
  return value ? `${label}: ${value}` : "";
}

function rate<T>(values: T[], predicate: (value: T) => boolean): number {
  if (values.length === 0) return 0;
  return values.filter(predicate).length / values.length;
}

function average(values: number[]): number {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function normalizePnl(value: number): number {
  return Math.max(0, Math.min(40, 20 + value));
}

function executionFriction(dataset: LearningDataset): number {
  if (dataset.executionMetrics.length === 0) return 0;
  const fillRatio = average(dataset.executionMetrics.map((metric) => metric.fillRatio));
  const delay = average(dataset.executionMetrics.map((metric) => metric.executionDelayMs));
  const slippage = average(dataset.executionMetrics.map((metric) => Math.abs(metric.entrySlippage + metric.exitSlippage) / 2));
  return Math.max(0, (1 - fillRatio) + Math.min(delay / 10_000, 1) + Math.min(slippage * 100, 1));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

export const adaptiveLearningEngine = new AdaptiveLearningEngine();
