export interface MarginEstimate {
  notional: number;
  initialMargin: number;
  estimatedFees: number;
  estimatedSlippage: number;
  estimatedFunding: number;
  estimatedEntryCost: number;
}

export class MarginCalculator {
  estimate(params: {
    entryPrice: number;
    quantity: number;
    leverage: number;
    feeRate: number;
    slippageRate: number;
    fundingRate: number;
  }): MarginEstimate {
    const leverage = Math.max(params.leverage, 1);
    const notional = params.entryPrice * params.quantity;
    const initialMargin = notional / leverage;
    const estimatedFees = notional * params.feeRate;
    const estimatedSlippage = notional * params.slippageRate;
    const estimatedFunding = notional * params.fundingRate;

    return {
      notional,
      initialMargin,
      estimatedFees,
      estimatedSlippage,
      estimatedFunding,
      estimatedEntryCost: initialMargin + estimatedFees + estimatedSlippage + estimatedFunding,
    };
  }
}
