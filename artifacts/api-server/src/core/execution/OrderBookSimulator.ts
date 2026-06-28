import type { ExecutionOrderRequest, FillResult, LiquidityRole, OrderType } from "./types";

export class OrderBookSimulator {
  simulate(params: {
    order: ExecutionOrderRequest;
    referencePrice: number;
    adjustedPrice: number;
  }): { fills: Omit<FillResult, "fee">[]; executionDelayMs: number } {
    const liquidityScore = params.order.market.liquidityScore ?? 1;
    const fillRatio = this.fillRatio(params.order.orderType, liquidityScore);
    const filledQuantity = params.order.requestedQuantity * fillRatio;
    const liquidityRole = this.liquidityRole(params.order.orderType);

    return {
      fills: filledQuantity > 0
        ? [{
            fillId: this.generateFillId(),
            price: params.adjustedPrice,
            quantity: filledQuantity,
            liquidityRole,
          }]
        : [],
      executionDelayMs: this.executionDelayMs(params.order.orderType, liquidityScore),
    };
  }

  private fillRatio(orderType: OrderType, liquidityScore: number): number {
    if (orderType === "MARKET" || orderType === "STOP_MARKET" || orderType === "EMERGENCY_CLOSE") return 1;
    if (liquidityScore >= 1) return 1;
    return Math.max(0.25, Math.min(1, liquidityScore));
  }

  private liquidityRole(orderType: OrderType): LiquidityRole {
    return orderType === "LIMIT" || orderType === "STOP_LIMIT" || orderType === "TAKE_PROFIT" ? "MAKER" : "TAKER";
  }

  private executionDelayMs(orderType: OrderType, liquidityScore: number): number {
    const base = orderType === "MARKET" || orderType === "EMERGENCY_CLOSE" ? 25 : 250;
    const liquidityPenalty = liquidityScore > 0 ? (1 / liquidityScore) * 25 : 250;
    return Math.round(base + liquidityPenalty);
  }

  private generateFillId(): string {
    return `FILL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
}
