import { BacktestEngine } from "./BacktestEngine";
import { DatasetManager } from "./DatasetManager";
import { ParameterOptimizer } from "./ParameterOptimizer";
import { PerformanceAnalyzer } from "./PerformanceAnalyzer";
import { StrategyEvaluator } from "./StrategyEvaluator";
import type { HistoricalDataset, PerformanceMetrics, WalkForwardRequest, WalkForwardSummary, WalkForwardWindow } from "./types";

export class WalkForwardEngine {
  constructor(
    private readonly backtestEngine = new BacktestEngine(),
    private readonly datasetManager = new DatasetManager(),
    private readonly optimizer = new ParameterOptimizer(),
    private readonly evaluator = new StrategyEvaluator(),
    private readonly analyzer = new PerformanceAnalyzer(),
  ) {}

  async run(request: WalkForwardRequest): Promise<WalkForwardSummary> {
    const windows = this.createWindows(request.dataset, request.trainingWindowBars, request.validationWindowBars, request.stepBars);
    const results: WalkForwardSummary["windows"] = [];
    const validationTrades = [];

    for (const window of windows) {
      const trainingDataset = this.datasetManager.slice(request.dataset, window.trainingStart, window.trainingEnd);
      const validationDataset = this.datasetManager.slice(request.dataset, window.validationStart, window.validationEnd);
      const optimized = await this.optimizer.optimize(request.candidates, async (candidate) => {
        const result = await this.backtestEngine.run({
          strategy: request.strategy,
          dataset: trainingDataset,
          parameters: candidate.parameters,
          initialEquity: request.initialEquity,
          persistResults: false,
        });
        return result.metrics;
      });
      const validation = await this.backtestEngine.run({
        strategy: request.strategy,
        dataset: validationDataset,
        parameters: optimized.best.parameters,
        initialEquity: request.initialEquity,
        persistResults: false,
      });
      validationTrades.push(...validation.trades);
      results.push({
        window,
        selected: optimized.best,
        trainingScore: optimized.score,
        validationScore: this.evaluator.evaluate(validation.metrics).score,
        validationMetrics: validation.metrics,
      });
    }

    return {
      windows: results,
      aggregateMetrics: this.analyzer.analyze(validationTrades, request.initialEquity),
    };
  }

  createWindows(dataset: HistoricalDataset, trainingWindowBars: number, validationWindowBars: number, stepBars = validationWindowBars): WalkForwardWindow[] {
    if (trainingWindowBars <= 0 || validationWindowBars <= 0 || stepBars <= 0) {
      throw new Error("Walk-forward windows must be positive");
    }

    const bars = this.datasetManager.normalize(dataset).bars;
    const windows: WalkForwardWindow[] = [];
    for (let startIndex = 0, index = 0; startIndex + trainingWindowBars + validationWindowBars <= bars.length; startIndex += stepBars, index += 1) {
      const trainingStart = bars[startIndex]!.timestamp;
      const trainingEnd = bars[startIndex + trainingWindowBars - 1]!.timestamp;
      const validationStart = bars[startIndex + trainingWindowBars]!.timestamp;
      const validationEnd = bars[startIndex + trainingWindowBars + validationWindowBars - 1]!.timestamp;
      windows.push({ index, trainingStart, trainingEnd, validationStart, validationEnd });
    }
    return windows;
  }

  summarizeMetrics(metrics: PerformanceMetrics[]): PerformanceMetrics {
    const trades = metrics.flatMap((metric) => metric.equityCurve.slice(1).map((point, index, points) => ({
      symbol: "AGGREGATE",
      direction: "LONG",
      entryAt: points[index - 1]?.timestamp ?? point.timestamp,
      exitAt: point.timestamp,
      entryPrice: 1,
      exitPrice: 1,
      quantity: 1,
      pnl: index === 0 ? 0 : point.equity - points[index - 1]!.equity,
      pnlPercent: 0,
      rMultiple: 0,
      riskAmount: 0,
      holdMinutes: 0,
      fees: 0,
    })));
    return this.analyzer.analyze(trades, 0);
  }
}
