import { BacktestEngine } from "./BacktestEngine";
import { BenchmarkEngine } from "./BenchmarkEngine";
import { DatasetManager } from "./DatasetManager";
import { ExperimentManager } from "./ExperimentManager";
import { ParameterOptimizer } from "./ParameterOptimizer";
import { PerformanceAnalyzer } from "./PerformanceAnalyzer";
import { StrategyEvaluator } from "./StrategyEvaluator";
import { WalkForwardEngine } from "./WalkForwardEngine";
import type {
  BacktestRequest,
  BacktestResult,
  BenchmarkResult,
  HistoricalDataset,
  ParameterCandidate,
  ParameterOptimizationResult,
  PerformanceMetrics,
  WalkForwardRequest,
  WalkForwardSummary,
} from "./types";

export class ResearchService {
  constructor(
    private readonly backtestEngine = new BacktestEngine(),
    private readonly walkForwardEngine = new WalkForwardEngine(),
    private readonly strategyEvaluator = new StrategyEvaluator(),
    private readonly parameterOptimizer = new ParameterOptimizer(),
    private readonly datasetManager = new DatasetManager(),
    private readonly performanceAnalyzer = new PerformanceAnalyzer(),
    private readonly benchmarkEngine = new BenchmarkEngine(),
    readonly experiments = new ExperimentManager(),
  ) {}

  async runBacktest(request: BacktestRequest): Promise<BacktestResult> {
    return await this.backtestEngine.run(request);
  }

  async runWalkForward(request: WalkForwardRequest): Promise<WalkForwardSummary> {
    return await this.walkForwardEngine.run(request);
  }

  async optimizeParameters(
    candidates: ParameterCandidate[],
    evaluateCandidate: (candidate: ParameterCandidate) => Promise<PerformanceMetrics>,
  ): Promise<ParameterOptimizationResult> {
    return await this.parameterOptimizer.optimize(candidates, evaluateCandidate);
  }

  evaluateStrategy(metrics: PerformanceMetrics) {
    return this.strategyEvaluator.evaluate(metrics);
  }

  analyzePerformance(trades: Parameters<PerformanceAnalyzer["analyze"]>[0], initialEquity: number): PerformanceMetrics {
    return this.performanceAnalyzer.analyze(trades, initialEquity);
  }

  generateBenchmarks(datasets: HistoricalDataset[], initialEquity: number): BenchmarkResult[] {
    return this.benchmarkEngine.compare(datasets, initialEquity);
  }

  replayDataset(dataset: HistoricalDataset) {
    return this.datasetManager.replay(dataset);
  }

  generateBacktestReport(result: BacktestResult): Record<string, unknown> {
    return {
      runId: result.runId,
      status: result.status,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      metrics: result.metrics,
      trades: result.trades,
      summary: {
        trades: result.metrics.tradeCount,
        winRate: result.metrics.winRate,
        profitFactor: result.metrics.profitFactor,
        expectancy: result.metrics.expectancy,
        maxDrawdown: result.metrics.maxDrawdown,
        totalReturn: result.metrics.totalReturn,
      },
    };
  }

  generateWalkForwardReport(summary: WalkForwardSummary): Record<string, unknown> {
    return {
      windows: summary.windows,
      aggregateMetrics: summary.aggregateMetrics,
      parameterComparison: summary.windows.map((item) => ({
        window: item.window.index,
        parameterSet: item.selected.name,
        trainingScore: item.trainingScore,
        validationScore: item.validationScore,
      })),
    };
  }
}

export const researchService = new ResearchService();
