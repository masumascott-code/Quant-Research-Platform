import { configService } from "../config";
import type { PaperTradeRecord } from "./TradeRepository";
import type { TradeState } from "./TradeStateMachine";

export type TradeResult = "WIN" | "LOSS" | "BREAKEVEN";
export type CloseTrigger = "MANUAL" | "STOP_LOSS" | "TP3";

export interface TradeAnalysisInput {
  setupType?: string;
  confidence?: string;
  source?: string;
  scannerType?: string;
  strategyType?: string;
  strategyLabel?: string | null;
  badge?: string | null;
  smcScore?: number | null;
  smcDetails?: unknown;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  score: number;
  grade?: string;
  reason: string;
  slReason?: string;
  rrRatio?: number | null;
}

export interface TradeSignalInput {
  id: number;
  symbol: string;
  direction: string;
  source?: string | null;
  scannerType?: string | null;
  strategyType?: string | null;
  strategyLabel?: string | null;
  badge?: string | null;
  smcScore?: string | number | null;
  smcDetails?: unknown;
}

export interface TradeOpenValues {
  tradeId: string;
  signalId: number;
  symbol: string;
  direction: string;
  source?: string;
  scannerType?: string;
  strategyType?: string;
  strategyLabel?: string | null;
  badge?: string | null;
  smcScore?: string | null;
  smcDetails?: unknown;
  setupType?: string;
  confidence?: string;
  entryPrice: string;
  stopLoss: string;
  currentSl: string;
  tp1: string;
  tp2: string;
  tp3: string;
  quantity: string;
  signalScore: string;
  signalGrade?: string;
  reason: string;
  slReason?: string;
  status: string;
}

export interface TradeCloseCalculation {
  exitPrice: number;
  exitReason: string;
  grossPnl: number;
  fees: number;
  pnl: number;
  pnlPercent: number;
  result: TradeResult;
  nextState: TradeState;
  holdingDurationMinutes: number;
  closedAt: Date;
}

export class TradeLifecycle {
  buildOpenValues(params: {
    tradeId: string;
    signal: TradeSignalInput;
    analysis: TradeAnalysisInput;
    quantity: number;
  }): TradeOpenValues {
    const { tradeId, signal, analysis, quantity } = params;
    return {
      tradeId,
      signalId: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      source: analysis.source ?? signal.source ?? undefined,
      scannerType: analysis.scannerType ?? signal.scannerType ?? undefined,
      strategyType: analysis.strategyType ?? signal.strategyType ?? undefined,
      strategyLabel: analysis.strategyLabel ?? signal.strategyLabel ?? undefined,
      badge: analysis.badge ?? signal.badge ?? undefined,
      smcScore: analysis.smcScore != null
        ? String(analysis.smcScore)
        : signal.smcScore != null
          ? String(signal.smcScore)
          : undefined,
      smcDetails: analysis.smcDetails ?? signal.smcDetails ?? undefined,
      setupType: analysis.setupType,
      confidence: analysis.confidence,
      entryPrice: String(analysis.entryPrice),
      stopLoss: String(analysis.stopLoss),
      currentSl: String(analysis.stopLoss),
      tp1: String(analysis.tp1),
      tp2: String(analysis.tp2),
      tp3: String(analysis.tp3),
      quantity: String(quantity),
      signalScore: String(analysis.score),
      signalGrade: analysis.grade,
      reason: analysis.reason,
      slReason: analysis.slReason,
      status: "open",
    };
  }

  calculateClose(params: {
    trade: PaperTradeRecord;
    exitPrice: number;
    exitReason: string;
    forceResult?: TradeResult;
  }): TradeCloseCalculation {
    const { trade, exitPrice, exitReason, forceResult } = params;
    const entry = Number(trade.entryPrice);
    const quantity = Number(trade.quantity);
    const isLong = trade.direction === "LONG";
    const grossPnl = isLong
      ? (exitPrice - entry) * quantity
      : (entry - exitPrice) * quantity;
    const fees = this.calculateFees(entry, exitPrice, quantity);
    const pnl = grossPnl - fees;
    const pnlPercent = (pnl / (entry * quantity)) * 100;
    const result = forceResult ?? this.classifyResult(pnl);
    const closedAt = new Date();
    const holdingDurationMinutes = Math.round(
      (closedAt.getTime() - new Date(trade.openedAt).getTime()) / 60_000
    );

    return {
      exitPrice,
      exitReason,
      grossPnl,
      fees,
      pnl,
      pnlPercent,
      result,
      nextState: result === "WIN" ? "CLOSED_WIN" : result === "LOSS" ? "CLOSED_LOSS" : "BREAKEVEN",
      holdingDurationMinutes,
      closedAt,
    };
  }

  calculateFees(entryPrice: number, exitPrice: number, quantity: number): number {
    const feeRate = configService.getSync().paperTrading.tradingFeeRate;
    return (entryPrice * quantity + exitPrice * quantity) * feeRate;
  }

  private classifyResult(pnl: number): TradeResult {
    if (Math.abs(pnl) < configService.getSync().paperTrading.breakEvenPnlThreshold) {
      return "BREAKEVEN";
    }
    return pnl > 0 ? "WIN" : "LOSS";
  }
}
