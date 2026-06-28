import type { EquityPoint, PerformanceMetrics, ResearchTrade } from "./types";

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function downsideDeviation(values: number[]): number {
  const downside = values.filter((value) => value < 0);
  return standardDeviation(downside);
}

export class PerformanceAnalyzer {
  analyze(trades: ResearchTrade[], initialEquity: number): PerformanceMetrics {
    const equityCurve = this.buildEquityCurve(trades, initialEquity);
    const wins = trades.filter((trade) => trade.pnl > 0);
    const losses = trades.filter((trade) => trade.pnl < 0);
    const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
    const finalEquity = equityCurve.at(-1)?.equity ?? initialEquity;
    const returns = this.tradeReturns(trades, initialEquity);
    const maxDrawdown = Math.max(0, ...equityCurve.map((point) => point.drawdown));
    const totalReturn = initialEquity > 0 ? (finalEquity - initialEquity) / initialEquity : 0;

    return {
      winRate: trades.length ? wins.length / trades.length : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0,
      expectancy: trades.length ? trades.reduce((sum, trade) => sum + trade.pnl, 0) / trades.length : 0,
      sharpeRatio: this.ratio(returns, standardDeviation(returns)),
      sortinoRatio: this.ratio(returns, downsideDeviation(returns)),
      calmarRatio: maxDrawdown > 0 ? totalReturn / maxDrawdown : totalReturn > 0 ? Number.POSITIVE_INFINITY : 0,
      maxDrawdown,
      averageHoldMinutes: mean(trades.map((trade) => trade.holdMinutes)),
      averageRMultiple: mean(trades.map((trade) => trade.rMultiple)),
      averageRisk: mean(trades.map((trade) => trade.riskAmount)),
      totalReturn,
      tradeCount: trades.length,
      equityCurve,
    };
  }

  buildEquityCurve(trades: ResearchTrade[], initialEquity: number): EquityPoint[] {
    let equity = initialEquity;
    let peak = initialEquity;
    const points: EquityPoint[] = [{ timestamp: trades[0]?.entryAt ?? new Date(0), equity, drawdown: 0 }];

    for (const trade of [...trades].sort((a, b) => (a.exitAt ?? a.entryAt).getTime() - (b.exitAt ?? b.entryAt).getTime())) {
      equity += trade.pnl;
      peak = Math.max(peak, equity);
      const drawdown = peak > 0 ? (peak - equity) / peak : 0;
      points.push({
        timestamp: trade.exitAt ?? trade.entryAt,
        equity,
        drawdown,
      });
    }

    return points;
  }

  private tradeReturns(trades: ResearchTrade[], initialEquity: number): number[] {
    let equity = initialEquity;
    return trades.map((trade) => {
      const base = equity;
      equity += trade.pnl;
      return base > 0 ? trade.pnl / base : 0;
    });
  }

  private ratio(returns: number[], denominator: number): number {
    if (returns.length === 0) return 0;
    if (denominator === 0) return mean(returns) > 0 ? Number.POSITIVE_INFINITY : 0;
    return mean(returns) / denominator;
  }
}
