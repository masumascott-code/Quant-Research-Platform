import { logger } from "../../lib/logger";
import type { PaperTradeRecord, TradeAnalysisInput, TradeSignalInput } from "../trading";
import { ExecutionEngine } from "./ExecutionEngine";
import { ExecutionRepository } from "./ExecutionRepository";
import { ExecutionValidator } from "./ExecutionValidator";
import { OrderManager } from "./OrderManager";
import type { ExecutionResult, MarketMicrostructure, OrderType } from "./types";
import type { ExecutionSummary } from "./types";

export class ExecutionService {
  constructor(
    private readonly validator = new ExecutionValidator(),
    private readonly orderManager = new OrderManager(),
    private readonly engine = new ExecutionEngine(),
    private readonly repository = new ExecutionRepository()
  ) {}

  async executeEntryOrder(params: {
    signal: TradeSignalInput;
    analysis: TradeAnalysisInput;
    orderType?: OrderType;
    market?: MarketMicrostructure;
  }): Promise<ExecutionResult | { rejected: true; reason: string }> {
    const preliminary = await this.validator.validateEntryOrder({
      signal: params.signal,
      analysis: params.analysis,
      orderType: params.orderType ?? "MARKET",
      side: params.signal.direction === "SHORT" ? "SELL" : "BUY",
      requestedQuantity: 1,
      market: params.market ?? {},
    });

    if (!preliminary.approved || !preliminary.portfolioApproval?.sizing) {
      const request = {
        signal: params.signal,
        analysis: params.analysis,
        orderType: params.orderType ?? "MARKET",
        side: params.signal.direction === "SHORT" ? "SELL" as const : "BUY" as const,
        requestedQuantity: 0,
        market: params.market ?? {},
      };
      let order = await this.orderManager.create(request);
      const reason = preliminary.reason ?? "Execution validation rejected order";
      order = await this.orderManager.transition(order, "REJECTED", reason);
      await this.repository.recordOrder(order);
      logger.warn({ symbol: params.signal.symbol, reason }, "Execution rejected entry order");
      return { rejected: true, reason };
    }

    const request = {
      signal: params.signal,
      analysis: params.analysis,
      orderType: params.orderType ?? "MARKET",
      side: params.signal.direction === "SHORT" ? "SELL" as const : "BUY" as const,
      requestedQuantity: preliminary.portfolioApproval.sizing.quantity,
      market: params.market ?? {},
    };
    let order = await this.orderManager.create(request);
    order = await this.orderManager.transition(order, "PENDING");
    const result = await this.engine.execute(order, preliminary.portfolioApproval);
    const finalOrder = await this.orderManager.transition(result.order, result.order.state);
    const finalResult = { ...result, order: finalOrder };
    const orderRowId = await this.repository.recordOrder(finalOrder);
    await this.repository.recordExecution(finalResult, orderRowId);
    return finalResult;
  }

  async executeExitOrder(params: {
    trade: PaperTradeRecord;
    exitPrice: number;
    orderType?: OrderType;
    market?: MarketMicrostructure;
  }): Promise<ExecutionResult | { rejected: true; reason: string }> {
    const quantity = Number(params.trade.quantity);
    if (quantity <= 0) {
      return { rejected: true, reason: "Exit order quantity must be greater than zero" };
    }

    const signal = {
      id: params.trade.signalId ?? params.trade.id,
      symbol: params.trade.symbol,
      direction: params.trade.direction,
    };
    const analysis = {
      direction: params.trade.direction,
      entryPrice: params.exitPrice,
      stopLoss: Number(params.trade.stopLoss),
      tp1: Number(params.trade.tp1),
      tp2: Number(params.trade.tp2),
      tp3: Number(params.trade.tp3),
      score: Number(params.trade.signalScore),
      grade: params.trade.signalGrade ?? undefined,
      reason: params.trade.reason,
      slReason: params.trade.slReason ?? undefined,
      setupType: params.trade.setupType ?? undefined,
      confidence: params.trade.confidence ?? undefined,
    };
    const request = {
      signal,
      analysis,
      orderType: params.orderType ?? "MARKET",
      side: params.trade.direction === "SHORT" ? "BUY" as const : "SELL" as const,
      requestedQuantity: quantity,
      market: params.market ?? {},
    };

    let order = await this.orderManager.create(request);
    order = await this.orderManager.transition(order, "PENDING");
    const portfolioApproval = {
      approved: true as const,
      reason: null,
      account: {
        accountId: null,
        accountType: "paper" as const,
        currency: "USDT",
        equity: 0,
        availableBalance: 0,
        usedMargin: 0,
        freeMargin: 0,
        leverage: 1,
      },
      sizing: null,
      summary: {
        currency: "USDT",
        equity: 0,
        availableBalance: 0,
        usedMargin: 0,
        freeMargin: 0,
        dailyPnl: 0,
        openExposure: 0,
        openTrades: 0,
        winRate: 0,
        riskUsagePercent: 0,
      },
    };
    const result = await this.engine.execute(order, portfolioApproval);
    const finalOrder = await this.orderManager.transition(result.order, result.order.state);
    const finalResult = { ...result, order: finalOrder };
    const orderRowId = await this.repository.recordOrder(finalOrder);
    await this.repository.recordExecution(finalResult, orderRowId);
    return finalResult;
  }

  async getSummary(): Promise<ExecutionSummary> {
    return await this.repository.getSummary();
  }
}

export const executionService = new ExecutionService();
