import { RiskCalculator } from "./RiskCalculator";
import { MarginCalculator, type MarginEstimate } from "./MarginCalculator";

export interface PositionSizingPlan {
  quantity: number;
  riskAmount: number;
  riskPercent: number;
  stopDistance: number;
  stopDistancePercent: number;
  notional: number;
  marginUsed: number;
  estimatedFees: number;
  estimatedSlippage: number;
  estimatedFunding: number;
  estimatedEntryCost: number;
}

export class PositionSizingService {
  constructor(
    private readonly riskCalculator = new RiskCalculator(),
    private readonly marginCalculator = new MarginCalculator()
  ) {}

  calculate(params: {
    equity: number;
    riskPercent: number;
    fixedNotional?: number;
    entryPrice: number;
    stopLoss: number;
    leverage: number;
    feeRate: number;
    slippageRate: number;
    fundingRate: number;
  }): PositionSizingPlan {
    const stopDistance = this.riskCalculator.stopDistance(params.entryPrice, params.stopLoss);
    if (params.equity <= 0) {
      throw new Error("Account equity must be greater than zero");
    }
    if (params.entryPrice <= 0 || stopDistance <= 0) {
      throw new Error("Entry price and stop loss must create a positive stop distance");
    }

    const fixedNotional = params.fixedNotional && params.fixedNotional > 0
      ? params.fixedNotional
      : null;
    const quantity = fixedNotional == null
      ? this.riskCalculator.riskBudget(params.equity, params.riskPercent) / stopDistance
      : fixedNotional / params.entryPrice;
    const riskAmount = quantity * stopDistance;
    const riskPercent = (riskAmount / params.equity) * 100;
    const margin = this.marginCalculator.estimate({
      entryPrice: params.entryPrice,
      quantity,
      leverage: params.leverage,
      feeRate: params.feeRate,
      slippageRate: params.slippageRate,
      fundingRate: params.fundingRate,
    });

    return this.toPlan(params, quantity, riskAmount, riskPercent, stopDistance, margin);
  }

  private toPlan(
    params: { entryPrice: number; stopLoss: number },
    quantity: number,
    riskAmount: number,
    riskPercent: number,
    stopDistance: number,
    margin: MarginEstimate
  ): PositionSizingPlan {
    return {
      quantity,
      riskAmount,
      riskPercent,
      stopDistance,
      stopDistancePercent: this.riskCalculator.stopDistancePercent(params.entryPrice, params.stopLoss),
      notional: margin.notional,
      marginUsed: margin.initialMargin,
      estimatedFees: margin.estimatedFees,
      estimatedSlippage: margin.estimatedSlippage,
      estimatedFunding: margin.estimatedFunding,
      estimatedEntryCost: margin.estimatedEntryCost,
    };
  }
}
