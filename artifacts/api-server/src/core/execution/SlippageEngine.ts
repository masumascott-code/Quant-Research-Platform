import type { MarketMicrostructure, SlippageEstimate } from "./types";

export class SlippageEngine {
  estimate(params: {
    market: MarketMicrostructure;
    orderSize: number;
    referencePrice: number;
  }): SlippageEstimate {
    const market = params.market;
    const volatility = Math.max(market.volatility ?? 0, 0);
    const atrRate = params.referencePrice > 0 ? Math.max(market.atr ?? 0, 0) / params.referencePrice : 0;
    const rvolPressure = Math.max((market.rvol ?? 1) - 1, 0);
    const spreadRate = params.referencePrice > 0 ? Math.max(market.spread ?? 0, 0) / params.referencePrice : 0;
    const liquidityScore = Math.max(market.liquidityScore ?? 1, 0);
    const liquidityPenalty = liquidityScore > 0 ? 1 / liquidityScore : 1;
    const sizePressure = params.referencePrice > 0 ? Math.max(params.orderSize * params.referencePrice, 0) / 1_000_000 : 0;

    const slippageRate =
      spreadRate +
      atrRate * 0.10 +
      volatility * 0.20 +
      rvolPressure * 0.0005 +
      sizePressure * liquidityPenalty * 0.0001;

    const slippage = params.referencePrice * slippageRate;
    return {
      entrySlippage: slippage,
      exitSlippage: slippage,
      slippageRate,
    };
  }
}
