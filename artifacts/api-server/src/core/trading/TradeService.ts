import { logger } from "../../lib/logger";
import { executionService } from "../execution";
import { portfolioService } from "../portfolio";
import { TradeEvents } from "./TradeEvents";
import { TradeLifecycle, type CloseTrigger, type TradeAnalysisInput, type TradeResult, type TradeSignalInput } from "./TradeLifecycle";
import { TradeRepository, type PaperTradeRecord } from "./TradeRepository";
import { TradeStateMachine } from "./TradeStateMachine";

export interface CloseTradeRequest {
  exitPrice: number;
  exitReason: string;
  trigger?: CloseTrigger;
  forceResult?: TradeResult;
}

export class TradeService {
  constructor(
    private readonly repository = new TradeRepository(),
    private readonly lifecycle = new TradeLifecycle(),
    private readonly stateMachine = new TradeStateMachine(),
    private readonly events = new TradeEvents()
  ) {}

  async getOpenTrades(): Promise<PaperTradeRecord[]> {
    return await this.repository.findOpen();
  }

  async openPaperTrade(signal: TradeSignalInput, analysis: TradeAnalysisInput): Promise<PaperTradeRecord | null> {
    const previousState = "PENDING";
    const execution = await executionService.executeEntryOrder({ signal, analysis });
    if ("rejected" in execution) {
      const nextState = this.stateMachine.transition(previousState, "TradeRejected", "REJECTED");
      await this.events.emit({
        name: "TradeRejected",
        signal,
        reason: execution.reason,
        previousState,
        nextState,
        transition: "TradeRejected",
        occurredAt: new Date(),
      });
      logger.warn({ symbol: signal.symbol, direction: signal.direction, reason: execution.reason }, "Trade rejected by execution service");
      return null;
    }

    const nextState = this.stateMachine.transition(previousState, "TradeOpened", "OPEN");
    const tradeId = this.generateTradeId();
    const quantity = execution.order.filledQuantity;
    const executedAnalysis = { ...analysis, entryPrice: execution.entryPrice };

    const trade = await this.repository.create(
      this.lifecycle.buildOpenValues({ tradeId, signal, analysis: executedAnalysis, quantity })
    );

    await this.repository.markSignalTraded(signal.id);
    await portfolioService.recordTradeOpened(trade, execution.portfolioApproval.sizing!);
    await this.events.emit({
      name: "TradeOpened",
      trade,
      previousState,
      nextState,
      transition: "TradeOpened",
      occurredAt: new Date(),
      telegram: { rrRatio: analysis.rrRatio ?? undefined },
    });

    logger.info({
      event: "paper_trade_opened",
      tradeId,
      signalId: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrice: execution.entryPrice,
      setupType: analysis.setupType,
    }, "Paper trade opened");
    return trade;
  }

  async closeTradeById(id: number, request: CloseTradeRequest): Promise<PaperTradeRecord> {
    const trade = await this.repository.findById(id);
    if (!trade) {
      throw new TradeServiceError("NOT_FOUND", "Trade not found");
    }
    return await this.closeTrade(trade, request);
  }

  async closeTrade(trade: PaperTradeRecord, request: CloseTradeRequest): Promise<PaperTradeRecord> {
    if (trade.status === "closed") {
      throw new TradeServiceError("ALREADY_CLOSED", "Trade already closed");
    }

    const previousState = this.stateMachine.derive(trade);
    const closeExecution = await executionService.executeExitOrder({
      trade,
      exitPrice: request.exitPrice,
      orderType: request.trigger === "STOP_LOSS"
        ? "STOP_MARKET"
        : request.trigger === "TP3"
          ? "TAKE_PROFIT"
          : "MARKET",
    });
    if ("rejected" in closeExecution) {
      throw new TradeServiceError("EXECUTION_REJECTED", closeExecution.reason);
    }

    const close = this.lifecycle.calculateClose({
      trade,
      exitPrice: closeExecution.averageFillPrice,
      exitReason: request.exitReason,
      forceResult: request.forceResult,
    });
    const nextState = this.stateMachine.transition(previousState, "TradeClosed", close.nextState);

    const updated = await this.repository.updateById(trade.id, {
      status: "closed",
      result: close.result,
      exitPrice: String(close.exitPrice),
      exitReason: close.exitReason,
      pnl: String(close.pnl),
      pnlPercent: String(close.pnlPercent),
      holdingDurationMinutes: close.holdingDurationMinutes,
      closedAt: close.closedAt,
    });

    await portfolioService.recordTradeClosed(updated);
    await this.events.emit({
      name: "TradeClosed",
      trade: updated,
      previousState,
      nextState,
      transition: "TradeClosed",
      occurredAt: close.closedAt,
      trigger: request.trigger ?? "MANUAL",
      result: close.result,
      exitPrice: close.exitPrice,
      exitReason: close.exitReason,
      pnl: close.pnl,
      pnlPercent: close.pnlPercent,
      holdingDurationMinutes: close.holdingDurationMinutes,
    });

    logger.info({ tradeId: trade.tradeId, result: close.result, pnl: close.pnl.toFixed(4) }, "Trade closed");
    return updated;
  }

  async processPriceTick(trade: PaperTradeRecord, markPrice: number): Promise<PaperTradeRecord | null> {
    const entry = Number(trade.entryPrice);
    const currentStop = Number(trade.currentSl ?? trade.stopLoss);
    const tp1 = Number(trade.tp1);
    const tp2 = Number(trade.tp2);
    const tp3 = Number(trade.tp3);
    const isLong = trade.direction === "LONG";

    const slHit = isLong ? markPrice <= currentStop : markPrice >= currentStop;
    if (slHit) {
      logger.info({ tradeId: trade.tradeId, symbol: trade.symbol, markPrice, sl: currentStop }, "SL hit - auto-closing");
      return await this.closeTrade(trade, {
        exitPrice: markPrice,
        exitReason: "Stop-loss hit (auto-close)",
        trigger: "STOP_LOSS",
        forceResult: "LOSS",
      });
    }

    const tp3Hit = !trade.tp3Hit && (isLong ? markPrice >= tp3 : markPrice <= tp3);
    if (tp3Hit) {
      const tp3Trade = await this.markTp3Hit(trade, markPrice);
      return await this.closeTrade(tp3Trade, {
        exitPrice: markPrice,
        exitReason: "TP3 target reached (auto-close)",
        trigger: "TP3",
        forceResult: "WIN",
      });
    }

    const tp2Newly = !trade.tp2Hit && (isLong ? markPrice >= tp2 : markPrice <= tp2);
    if (tp2Newly) {
      await this.markTp2Hit(trade, markPrice, tp1);
    }

    const tp1Newly = !trade.tp1Hit && (isLong ? markPrice >= tp1 : markPrice <= tp1);
    if (tp1Newly && !tp2Newly) {
      await this.markTp1Hit(trade, markPrice, entry);
    }

    return null;
  }

  private async markTp1Hit(trade: PaperTradeRecord, markPrice: number, newStop: number): Promise<PaperTradeRecord> {
    const previousState = this.stateMachine.derive(trade);
    const targetState = this.stateMachine.transition(previousState, "TP1Hit", "TP1_HIT");
    const nextState = this.stateMachine.transition(targetState, "StopMoved", "BREAKEVEN");
    const updated = await this.repository.updateById(trade.id, { tp1Hit: true, currentSl: String(newStop) });

    await this.events.emit({
      name: "TP1Hit",
      trade: updated,
      previousState,
      nextState: targetState,
      transition: "TP1Hit",
      occurredAt: new Date(),
      price: markPrice,
    });
    await this.events.emit({
      name: "StopMoved",
      trade: updated,
      previousState: targetState,
      nextState,
      transition: "StopMoved",
      occurredAt: new Date(),
      previousStop: Number(trade.currentSl ?? trade.stopLoss),
      nextStop: newStop,
    });
    logger.info({ tradeId: trade.tradeId, symbol: trade.symbol, newSl: newStop }, "TP1 hit - SL moved to breakeven");
    return updated;
  }

  private async markTp2Hit(trade: PaperTradeRecord, markPrice: number, newStop: number): Promise<PaperTradeRecord> {
    const previousState = this.stateMachine.derive(trade);
    const targetState = this.stateMachine.transition(previousState, "TP2Hit", "TP2_HIT");
    const nextState = this.stateMachine.transition(targetState, "StopMoved", "TRAILING");
    const updated = await this.repository.updateById(trade.id, { tp2Hit: true, currentSl: String(newStop) });

    await this.events.emit({
      name: "TP2Hit",
      trade: updated,
      previousState,
      nextState: targetState,
      transition: "TP2Hit",
      occurredAt: new Date(),
      price: markPrice,
    });
    await this.events.emit({
      name: "StopMoved",
      trade: updated,
      previousState: targetState,
      nextState,
      transition: "StopMoved",
      occurredAt: new Date(),
      previousStop: Number(trade.currentSl ?? trade.stopLoss),
      nextStop: newStop,
    });
    logger.info({ tradeId: trade.tradeId, symbol: trade.symbol, newSl: newStop }, "TP2 hit - SL trailed to TP1");
    return updated;
  }

  private async markTp3Hit(trade: PaperTradeRecord, markPrice: number): Promise<PaperTradeRecord> {
    const previousState = this.stateMachine.derive(trade);
    const nextState = this.stateMachine.transition(previousState, "TP3Hit", "TP3_HIT");
    const updated = await this.repository.updateById(trade.id, { tp3Hit: true });

    await this.events.emit({
      name: "TP3Hit",
      trade: updated,
      previousState,
      nextState,
      transition: "TP3Hit",
      occurredAt: new Date(),
      price: markPrice,
    });
    logger.info({ tradeId: trade.tradeId, symbol: trade.symbol, markPrice }, "TP3 hit");
    return updated;
  }

  private generateTradeId(): string {
    return `PT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
}

export class TradeServiceError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "ALREADY_CLOSED" | "EXECUTION_REJECTED",
    message: string
  ) {
    super(message);
    this.name = "TradeServiceError";
  }
}

export const tradeService = new TradeService();
