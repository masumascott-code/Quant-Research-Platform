export interface TradeRiskInput {
  entryPrice: number;
  stopLoss: number;
  quantity: number;
}

export class RiskCalculator {
  stopDistance(entryPrice: number, stopLoss: number): number {
    return Math.abs(entryPrice - stopLoss);
  }

  stopDistancePercent(entryPrice: number, stopLoss: number): number {
    if (entryPrice <= 0) return 0;
    return (this.stopDistance(entryPrice, stopLoss) / entryPrice) * 100;
  }

  riskBudget(equity: number, riskPercent: number): number {
    return equity * (riskPercent / 100);
  }

  tradeRisk(input: TradeRiskInput): number {
    return this.stopDistance(input.entryPrice, input.stopLoss) * input.quantity;
  }

  dailyLossPercent(equity: number, dailyPnl: number): number {
    if (equity <= 0 || dailyPnl >= 0) return 0;
    return (Math.abs(dailyPnl) / equity) * 100;
  }

  drawdownPercent(startingEquity: number, currentEquity: number): number {
    if (startingEquity <= 0 || currentEquity >= startingEquity) return 0;
    return ((startingEquity - currentEquity) / startingEquity) * 100;
  }
}
