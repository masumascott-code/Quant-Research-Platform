import type {
  Displacement,
  FairValueGap,
  HtfBias,
  LiquiditySweep,
  OrderBlock,
  PremiumDiscountZone,
  SmcScoreBreakdown,
  StructureEvent,
  TradeDirection,
} from "./types";
import { scoreRiskReward } from "./smc-risk-engine";

export function calculateSmcScore(params: {
  direction: TradeDirection;
  htfBias: HtfBias;
  sweep: LiquiditySweep | null;
  structureEvent: StructureEvent | null;
  displacement: Displacement | null;
  fvg: FairValueGap | null;
  orderBlock: OrderBlock | null;
  premiumDiscount: PremiumDiscountZone | null;
  rr: number;
  minRiskReward: number;
}): SmcScoreBreakdown {
  const expectedBias = params.direction === "LONG" ? "bullish" : "bearish";
  const htfBias = params.htfBias === expectedBias
    ? 15
    : params.htfBias === "neutral"
      ? 7
      : 0;
  const liquiditySweep = params.sweep ? scale(params.sweep.strength, 20) : 0;
  const structure = params.structureEvent ? scale(params.structureEvent.strength, 20) : 0;
  const displacement = params.displacement ? scale(params.displacement.strength, 15) : 0;
  const poiQuality = Math.max(params.fvg?.score ?? 0, params.orderBlock?.score ?? 0);
  const poi = poiQuality > 0 ? scale(poiQuality, 15) : 0;
  const premiumDiscount = params.premiumDiscount?.validForDirection
    ? scale(params.premiumDiscount.score, 5)
    : 0;
  const riskReward = scale(scoreRiskReward(params.rr, params.minRiskReward), 10);
  const total = htfBias + liquiditySweep + structure + displacement + poi + premiumDiscount + riskReward;

  return {
    htfBias,
    liquiditySweep,
    structure,
    displacement,
    poi,
    premiumDiscount,
    riskReward,
    total: Math.max(0, Math.min(100, total)),
  };
}

function scale(score: number, weight: number): number {
  return Math.max(0, Math.min(weight, (score / 100) * weight));
}
