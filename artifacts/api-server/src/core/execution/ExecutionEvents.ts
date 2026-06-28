import { logger } from "../../lib/logger";
import type { ManagedOrder, OrderState } from "./types";

export interface ExecutionEvent {
  name: "OrderNew" | "OrderPending" | "OrderPartiallyFilled" | "OrderFilled" | "OrderCancelled" | "OrderRejected" | "OrderExpired";
  order: ManagedOrder;
  previousState: OrderState | null;
  nextState: OrderState;
  reason?: string;
  occurredAt: Date;
}

type ExecutionEventHandler = (event: ExecutionEvent) => Promise<void> | void;

export class ExecutionEvents {
  private handlers: ExecutionEventHandler[] = [];

  on(handler: ExecutionEventHandler): void {
    this.handlers.push(handler);
  }

  async emit(event: ExecutionEvent): Promise<void> {
    logger.info({
      orderId: event.order.orderId,
      event: event.name,
      previousState: event.previousState,
      nextState: event.nextState,
      reason: event.reason,
    }, "Execution event emitted");

    for (const handler of this.handlers) {
      await handler(event);
    }
  }
}
