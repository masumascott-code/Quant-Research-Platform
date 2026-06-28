import type { FundingCharge } from "./types";

export class FundingEngine {
  calculate(params: {
    notional: number;
    fundingRate: number;
    intervalHours: number;
    holdingHours?: number;
  }): FundingCharge {
    const intervals = params.holdingHours == null || params.holdingHours <= 0
      ? 0
      : params.holdingHours / Math.max(params.intervalHours, 1);
    const fundingFee = params.notional * params.fundingRate * intervals;
    return {
      fundingRate: params.fundingRate,
      fundingFee,
      intervalHours: params.intervalHours,
    };
  }
}
