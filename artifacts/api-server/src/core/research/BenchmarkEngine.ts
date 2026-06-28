import { PerformanceAnalyzer } from "./PerformanceAnalyzer";
import type { BenchmarkResult, EquityPoint, HistoricalDataset, ResearchTrade } from "./types";

export class BenchmarkEngine {
  constructor(private readonly analyzer = new PerformanceAnalyzer()) {}

  buyAndHold(dataset: HistoricalDataset, initialEquity: number, name = "Buy & Hold"): BenchmarkResult {
    const first = dataset.bars[0];
    const last = dataset.bars.at(-1);
    if (!first || !last || first.close <= 0) {
      return { name, symbol: dataset.symbol, totalReturn: 0, finalEquity: initialEquity, maxDrawdown: 0, equityCurve: [] };
    }

    const quantity = initialEquity / first.close;
    const trade: ResearchTrade = {
      symbol: dataset.symbol,
      direction: "LONG",
      entryAt: first.timestamp,
      exitAt: last.timestamp,
      entryPrice: first.close,
      exitPrice: last.close,
      quantity,
      pnl: (last.close - first.close) * quantity,
      pnlPercent: ((last.close - first.close) / first.close) * 100,
      rMultiple: 0,
      riskAmount: initialEquity,
      holdMinutes: Math.round((last.timestamp.getTime() - first.timestamp.getTime()) / 60_000),
      fees: 0,
    };
    const metrics = this.analyzer.analyze([trade], initialEquity);
    return {
      name,
      symbol: dataset.symbol,
      totalReturn: metrics.totalReturn,
      finalEquity: metrics.equityCurve.at(-1)?.equity ?? initialEquity,
      maxDrawdown: this.priceDrawdown(dataset, initialEquity),
      equityCurve: this.buyAndHoldCurve(dataset, quantity, initialEquity),
    };
  }

  compare(datasets: HistoricalDataset[], initialEquity: number): BenchmarkResult[] {
    return datasets.map((dataset) => this.buyAndHold(dataset, initialEquity, `${dataset.symbol} Benchmark`));
  }

  private buyAndHoldCurve(dataset: HistoricalDataset, quantity: number, initialEquity: number): EquityPoint[] {
    let peak = initialEquity;
    return dataset.bars.map((bar) => {
      const equity = quantity * bar.close;
      peak = Math.max(peak, equity);
      return {
        timestamp: bar.timestamp,
        equity,
        drawdown: peak > 0 ? (peak - equity) / peak : 0,
      };
    });
  }

  private priceDrawdown(dataset: HistoricalDataset, initialEquity: number): number {
    const first = dataset.bars[0];
    if (!first || first.close <= 0) return 0;
    const curve = this.buyAndHoldCurve(dataset, initialEquity / first.close, initialEquity);
    return Math.max(0, ...curve.map((point) => point.drawdown));
  }
}
