import { logger } from "../../lib/logger";
import { riskManager } from "../../services/risk-manager";
import { reviewClosedTrade } from "../../services/learning-engine";
import { Telegram } from "../../services/telegram";
import type { CloseTrigger, TradeResult } from "./TradeLifecycle";
import type { PaperTradeRecord } from "./TradeRepository";
import type { TradeState, TradeTransition } from "./TradeStateMachine";

export type TradeEventName =
  | "TradeOpened"
  | "TradeUpdated"
  | "TP1Hit"
  | "TP2Hit"
  | "TP3Hit"
  | "StopMoved"
  | "TradeClosed"
  | "TradeCancelled"
  | "TradeRejected";

export interface BaseTradeEvent {
  name: TradeEventName;
  trade: PaperTradeRecord;
  previousState: TradeState;
  nextState: TradeState;
  transition: TradeTransition;
  occurredAt: Date;
}

export interface TradeOpenedEvent extends BaseTradeEvent {
  name: "TradeOpened";
  telegram: {
    rrRatio?: number;
  };
}

export interface TradeClosedEvent extends BaseTradeEvent {
  name: "TradeClosed";
  trigger: CloseTrigger;
  result: TradeResult;
  exitPrice: number;
  exitReason: string;
  pnl: number;
  pnlPercent: number;
  holdingDurationMinutes: number;
}

export interface TradePriceEvent extends BaseTradeEvent {
  name: "TP1Hit" | "TP2Hit" | "TP3Hit";
  price: number;
}

export interface StopMovedEvent extends BaseTradeEvent {
  name: "StopMoved";
  previousStop: number;
  nextStop: number;
}

export interface TradeRejectedEvent {
  name: "TradeRejected";
  signal: {
    id: number;
    symbol: string;
    direction: string;
  };
  reason: string;
  previousState: TradeState;
  nextState: TradeState;
  transition: TradeTransition;
  occurredAt: Date;
}

export type TradeEvent =
  | TradeOpenedEvent
  | TradeClosedEvent
  | TradePriceEvent
  | StopMovedEvent
  | TradeRejectedEvent
  | (BaseTradeEvent & { name: "TradeUpdated" | "TradeCancelled" });

type TradeEventHandler = (event: TradeEvent) => Promise<void> | void;

export class TradeEvents {
  private handlers: TradeEventHandler[] = [];

  constructor() {
    this.on(event => this.handleDefaultConsumers(event));
  }

  on(handler: TradeEventHandler): void {
    this.handlers.push(handler);
  }

  async emit(event: TradeEvent): Promise<void> {
    logger.info(
      {
        tradeId: event.name === "TradeRejected" ? undefined : event.trade.tradeId,
        signalId: event.name === "TradeRejected" ? event.signal.id : undefined,
        event: event.name,
        previousState: event.previousState,
        nextState: event.nextState,
        reason: event.name === "TradeRejected" ? event.reason : undefined,
      },
      "Trade lifecycle event emitted"
    );

    for (const handler of this.handlers) {
      await handler(event);
    }
  }

  private async handleDefaultConsumers(event: TradeEvent): Promise<void> {
    switch (event.name) {
      case "TradeOpened":
        await riskManager.recordTradeOpened();
        await Telegram.tradeOpened({
          tradeId: event.trade.tradeId,
          symbol: event.trade.symbol,
          direction: event.trade.direction,
          setupType: event.trade.setupType ?? undefined,
          confidence: event.trade.confidence ?? undefined,
          entryPrice: Number(event.trade.entryPrice),
          stopLoss: Number(event.trade.stopLoss),
          tp1: Number(event.trade.tp1),
          tp2: Number(event.trade.tp2),
          tp3: Number(event.trade.tp3),
          signalScore: Number(event.trade.signalScore),
          reason: event.trade.reason,
          rrRatio: event.telegram.rrRatio,
        });
        return;

      case "TP1Hit":
        await Telegram.tp1Hit(event.trade.tradeId, event.trade.symbol, event.price).catch(() => {});
        return;

      case "TP2Hit":
        await Telegram.tp2Hit(event.trade.tradeId, event.trade.symbol, event.price).catch(() => {});
        return;

      case "TP3Hit":
        await Telegram.tp3Hit(event.trade.tradeId, event.trade.symbol, event.price).catch(() => {});
        return;

      case "TradeClosed":
        if (event.trigger === "STOP_LOSS") {
          await Telegram.slHit(event.trade.tradeId, event.trade.symbol, event.exitPrice).catch(() => {});
        }
        await Telegram.tradeClosed({
          tradeId: event.trade.tradeId,
          symbol: event.trade.symbol,
          direction: event.trade.direction,
          setupType: event.trade.setupType ?? undefined,
          entryPrice: Number(event.trade.entryPrice),
          exitPrice: event.exitPrice,
          pnl: event.pnl,
          pnlPercent: event.pnlPercent,
          result: event.result,
          exitReason: event.exitReason,
          holdingDurationMinutes: event.holdingDurationMinutes,
        }).catch(() => {});
        await reviewClosedTrade(event.trade.id).catch(() => {});
        await riskManager.recordTradeClosed(event.result);
        return;

      default:
        return;
    }
  }
}
