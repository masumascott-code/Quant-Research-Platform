import type { FeeBreakdown, LiquidityRole } from "./types";

export class FeeEngine {
  calculate(params: {
    notional: number;
    liquidityRole: LiquidityRole;
    makerFeeRate: number;
    takerFeeRate: number;
    commissionRate?: number;
    fundingFee?: number;
  }): FeeBreakdown {
    const makerFee = params.liquidityRole === "MAKER" ? params.notional * params.makerFeeRate : 0;
    const takerFee = params.liquidityRole === "TAKER" ? params.notional * params.takerFeeRate : 0;
    const tradingFee = makerFee + takerFee;
    const commission = params.notional * (params.commissionRate ?? 0);
    const fundingFee = params.fundingFee ?? 0;

    return {
      makerFee,
      takerFee,
      tradingFee,
      commission,
      fundingFee,
      totalFee: tradingFee + commission + fundingFee,
    };
  }

  combine(fees: FeeBreakdown[]): FeeBreakdown {
    return fees.reduce<FeeBreakdown>((total, fee) => ({
      makerFee: total.makerFee + fee.makerFee,
      takerFee: total.takerFee + fee.takerFee,
      tradingFee: total.tradingFee + fee.tradingFee,
      commission: total.commission + fee.commission,
      fundingFee: total.fundingFee + fee.fundingFee,
      totalFee: total.totalFee + fee.totalFee,
    }), {
      makerFee: 0,
      takerFee: 0,
      tradingFee: 0,
      commission: 0,
      fundingFee: 0,
      totalFee: 0,
    });
  }
}
