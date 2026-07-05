import type { PremiumDiscountZone, SmcCandle, TradeDirection } from "./types";
import { detectSwingHighs, detectSwingLows } from "./smc-structure-engine";

export function calculatePremiumDiscount(
  candles: SmcCandle[],
  direction: TradeDirection,
  price: number,
): PremiumDiscountZone | null {
  const swingHigh = detectSwingHighs(candles, 2, 2).slice(-1)[0];
  const swingLow = detectSwingLows(candles, 2, 2).slice(-1)[0];
  if (!swingHigh || !swingLow || swingHigh.price <= swingLow.price) return null;

  const equilibrium = swingLow.price + (swingHigh.price - swingLow.price) / 2;
  const distance = Math.abs(price - equilibrium) / (swingHigh.price - swingLow.price);
  const zone = price > equilibrium ? "premium" : price < equilibrium ? "discount" : "equilibrium";
  const validForDirection = direction === "LONG" ? zone === "discount" : zone === "premium";

  return {
    swingHigh: swingHigh.price,
    swingLow: swingLow.price,
    equilibrium,
    zone,
    validForDirection,
    score: validForDirection ? Math.min(100, 50 + distance * 100) : 0,
  };
}
