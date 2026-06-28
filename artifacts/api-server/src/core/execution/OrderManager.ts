import type { ExecutionOrderRequest, ManagedOrder, OrderState } from "./types";
import { ExecutionEvents } from "./ExecutionEvents";

export class OrderManager {
  constructor(private readonly events = new ExecutionEvents()) {}

  async create(request: ExecutionOrderRequest): Promise<ManagedOrder> {
    const order: ManagedOrder = {
      orderId: this.generateOrderId(),
      state: "NEW",
      request,
      filledQuantity: 0,
      remainingQuantity: request.requestedQuantity,
      averageFillPrice: null,
      executionDelayMs: 0,
    };
    await this.events.emit({
      name: "OrderNew",
      order,
      previousState: null,
      nextState: "NEW",
      occurredAt: new Date(),
    });
    return order;
  }

  async transition(order: ManagedOrder, nextState: OrderState, reason?: string): Promise<ManagedOrder> {
    const previousState = order.state;
    const updated = { ...order, state: nextState, rejectionReason: nextState === "REJECTED" ? reason : order.rejectionReason };
    await this.events.emit({
      name: this.eventName(nextState),
      order: updated,
      previousState,
      nextState,
      reason,
      occurredAt: new Date(),
    });
    return updated;
  }

  applyFill(order: ManagedOrder, params: {
    filledQuantity: number;
    averageFillPrice: number;
    executionDelayMs: number;
  }): ManagedOrder {
    const remainingQuantity = Math.max(order.request.requestedQuantity - params.filledQuantity, 0);
    const state = remainingQuantity > 0 ? "PARTIALLY_FILLED" : "FILLED";
    return {
      ...order,
      state,
      filledQuantity: params.filledQuantity,
      remainingQuantity,
      averageFillPrice: params.averageFillPrice,
      executionDelayMs: params.executionDelayMs,
    };
  }

  private eventName(state: OrderState) {
    switch (state) {
      case "PENDING": return "OrderPending";
      case "PARTIALLY_FILLED": return "OrderPartiallyFilled";
      case "FILLED": return "OrderFilled";
      case "CANCELLED": return "OrderCancelled";
      case "REJECTED": return "OrderRejected";
      case "EXPIRED": return "OrderExpired";
      case "NEW": return "OrderNew";
    }
  }

  private generateOrderId(): string {
    return `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
}
