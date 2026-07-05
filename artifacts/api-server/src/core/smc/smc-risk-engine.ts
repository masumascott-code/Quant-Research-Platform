import type { FairValueGap, LiquidityLevel, LiquiditySweep, OrderBlock, SmcRiskPlan, TradeDirection } from "./types";
import { nextLiquidityTarget } from "./liquidity-engine";

export function calculateRiskPlan(params: {
  direction: TradeDirection;
  currentPrice: number;
  sweep: LiquiditySweep | null;
  orderBlock: OrderBlock | null;
  fvg: FairValueGap | null;
  liquidityLevels: LiquidityLevel[];
  minRiskReward: number;
}): SmcRiskPlan | null {
  const { direction, currentPrice, sweep, orderBlock, fvg, liquidityLevels, minRiskReward } = params;
  const entry = currentPrice;
  const poiLow = orderBlock?.low ?? fvg?.lower ?? currentPrice;
  const poiHigh = orderBlock?.high ?? fvg?.upper ?? currentPrice;
  const stopBuffer = entry * 0.001;
  const stopLoss = direction === "LONG"
    ? Math.min(sweep?.sweptLevel ?? poiLow, poiLow) - stopBuffer
    : Math.max(sweep?.sweptLevel ?? poiHigh, poiHigh) + stopBuffer;
  const risk = direction === "LONG" ? entry - stopLoss : stopLoss - entry;
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const nextLiquidity = nextLiquidityTarget(liquidityLevels, direction, entry);
  const minimumTarget = direction === "LONG"
    ? entry + risk * minRiskReward
    : entry - risk * minRiskReward;
  const tp2 = nextLiquidity && (direction === "LONG" ? nextLiquidity > minimumTarget : nextLiquidity < minimumTarget)
    ? nextLiquidity
    : minimumTarget;
  const reward = direction === "LONG" ? tp2 - entry : entry - tp2;
  const rr = reward / risk;
  if (!Number.isFinite(rr) || rr <= 0) return null;

  return {
    entry,
    stopLoss,
    tp1: direction === "LONG" ? entry + risk : entry - risk,
    tp2,
    tp3: direction === "LONG" ? entry + risk * Math.max(3, rr + 1) : entry - risk * Math.max(3, rr + 1),
    rr,
    risk,
    reward,
  };
}

export function isPriceInsidePoi(
  direction: TradeDirection,
  price: number,
  fvg: FairValueGap | null,
  orderBlock: OrderBlock | null,
): boolean {
  const tolerance = price * 0.0025;
  const lower = orderBlock?.low ?? fvg?.lower;
  const upper = orderBlock?.high ?? fvg?.upper;
  if (lower == null || upper == null) return false;
  if (price >= lower - tolerance && price <= upper + tolerance) return true;
  return direction === "LONG" ? price <= upper + tolerance : price >= lower - tolerance;
}

export function scoreRiskReward(rr: number, minRiskReward: number): number {
  if (!Number.isFinite(rr) || rr <= 0) return 0;
  if (rr < minRiskReward) return Math.max(0, (rr / minRiskReward) * 50);
  return Math.min(100, 70 + (rr - minRiskReward) * 15);
}
