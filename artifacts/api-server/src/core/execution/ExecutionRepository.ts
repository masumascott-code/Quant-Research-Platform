import {
  db,
  executionsTable,
  feesTable,
  fillsTable,
  fundingHistoryTable,
  ordersTable,
} from "@workspace/db";
import { logger } from "../../lib/logger";
import type { ExecutionResult, ManagedOrder } from "./types";
import type { ExecutionSummary } from "./types";

export class ExecutionRepository {
  async recordOrder(order: ManagedOrder): Promise<number | null> {
    try {
      const [created] = await db.insert(ordersTable).values({
        orderId: order.orderId,
        accountId: null,
        signalId: order.request.signal.id,
        symbol: order.request.signal.symbol,
        side: order.request.side,
        orderType: order.request.orderType,
        status: order.state,
        requestedQuantity: String(order.request.requestedQuantity),
        filledQuantity: String(order.filledQuantity),
        remainingQuantity: String(order.remainingQuantity),
        limitPrice: order.request.limitPrice == null ? null : String(order.request.limitPrice),
        stopPrice: order.request.stopPrice == null ? null : String(order.request.stopPrice),
        averageFillPrice: order.averageFillPrice == null ? null : String(order.averageFillPrice),
        executionDelayMs: order.executionDelayMs,
        rejectionReason: order.rejectionReason,
        updatedAt: new Date(),
      }).returning();
      return created?.id ?? null;
    } catch (err) {
      logger.warn({ err, orderId: order.orderId }, "Failed to record execution order");
      return null;
    }
  }

  async recordExecution(result: ExecutionResult, orderRowId: number | null): Promise<void> {
    try {
      await db.insert(executionsTable).values({
        executionId: `EXE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        orderId: result.order.orderId,
        orderRowId,
        symbol: result.order.request.signal.symbol,
        side: result.order.request.side,
        status: result.order.state,
        requestedQuantity: String(result.order.request.requestedQuantity),
        filledQuantity: String(result.order.filledQuantity),
        remainingQuantity: String(result.order.remainingQuantity),
        averageFillPrice: String(result.averageFillPrice),
        entrySlippage: String(result.entrySlippage),
        exitSlippage: String(result.exitSlippage),
        executionDelayMs: result.executionDelayMs,
        fillRatio: String(result.fillRatio),
      });

      for (const fill of result.fills) {
        await db.insert(fillsTable).values({
          fillId: fill.fillId,
          orderId: result.order.orderId,
          orderRowId,
          symbol: result.order.request.signal.symbol,
          side: result.order.request.side,
          price: String(fill.price),
          quantity: String(fill.quantity),
          liquidityRole: fill.liquidityRole,
          fee: String(fill.fee),
        });
      }

      await db.insert(feesTable).values({
        orderId: result.order.orderId,
        symbol: result.order.request.signal.symbol,
        makerFee: String(result.fees.makerFee),
        takerFee: String(result.fees.takerFee),
        tradingFee: String(result.fees.tradingFee),
        commission: String(result.fees.commission),
        fundingFee: String(result.fees.fundingFee),
        totalFee: String(result.fees.totalFee),
      });

      await db.insert(fundingHistoryTable).values({
        tradeId: result.order.orderId,
        symbol: result.order.request.signal.symbol,
        notional: String(result.order.averageFillPrice == null ? 0 : result.order.averageFillPrice * result.order.filledQuantity),
        fundingRate: String(result.funding.fundingRate),
        fundingFee: String(result.funding.fundingFee),
        intervalHours: String(result.funding.intervalHours),
      });
    } catch (err) {
      logger.warn({ err, orderId: result.order.orderId }, "Failed to record execution result");
    }
  }

  async recordFunding(tradeId: string, symbol: string, notional: number, fundingRate: number, fundingFee: number, intervalHours: number): Promise<void> {
    try {
      await db.insert(fundingHistoryTable).values({
        tradeId,
        symbol,
        notional: String(notional),
        fundingRate: String(fundingRate),
        fundingFee: String(fundingFee),
        intervalHours: String(intervalHours),
      });
    } catch (err) {
      logger.warn({ err, tradeId }, "Failed to record funding history");
    }
  }

  async getSummary(): Promise<ExecutionSummary> {
    try {
      const [orders, executions, fees] = await Promise.all([
        db.select().from(ordersTable),
        db.select().from(executionsTable),
        db.select().from(feesTable),
      ]);
      const totalOrders = orders.length;
      const fillRatio = executions.length > 0
        ? executions.reduce((sum, execution) => sum + Number(execution.fillRatio), 0) / executions.length
        : 0;
      const averageSlippage = executions.length > 0
        ? executions.reduce((sum, execution) => sum + Math.abs(Number(execution.entrySlippage)) + Math.abs(Number(execution.exitSlippage)), 0) / executions.length
        : 0;
      const averageFillTimeMs = executions.length > 0
        ? executions.reduce((sum, execution) => sum + execution.executionDelayMs, 0) / executions.length
        : 0;
      const totalFees = fees.reduce((sum, fee) => sum + Number(fee.totalFee), 0);
      const fundingCost = fees.reduce((sum, fee) => sum + Number(fee.fundingFee), 0);

      return {
        totalOrders,
        averageSlippage,
        averageFees: fees.length > 0 ? totalFees / fees.length : 0,
        fundingCost,
        fillRatio,
        averageFillTimeMs,
        rejectedOrders: orders.filter((order) => order.status === "REJECTED").length,
        cancelledOrders: orders.filter((order) => order.status === "CANCELLED").length,
      };
    } catch (err) {
      logger.warn({ err }, "Failed to generate execution summary");
      return {
        totalOrders: 0,
        averageSlippage: 0,
        averageFees: 0,
        fundingCost: 0,
        fillRatio: 0,
        averageFillTimeMs: 0,
        rejectedOrders: 0,
        cancelledOrders: 0,
      };
    }
  }
}
