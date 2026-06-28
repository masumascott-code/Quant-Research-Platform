import type { PortfolioApproval } from "../portfolio";
import type { TradeAnalysisInput, TradeSignalInput } from "../trading";

export type OrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP_MARKET"
  | "STOP_LIMIT"
  | "TAKE_PROFIT"
  | "TRAILING_STOP"
  | "PARTIAL_CLOSE"
  | "EMERGENCY_CLOSE";

export type OrderSide = "BUY" | "SELL";
export type OrderState = "NEW" | "PENDING" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED";
export type LiquidityRole = "MAKER" | "TAKER";

export interface MarketMicrostructure {
  volatility?: number;
  atr?: number;
  rvol?: number;
  spread?: number;
  liquidityScore?: number;
}

export interface ExecutionOrderRequest {
  signal: TradeSignalInput;
  analysis: TradeAnalysisInput;
  orderType: OrderType;
  side: OrderSide;
  requestedQuantity: number;
  limitPrice?: number;
  stopPrice?: number;
  market: MarketMicrostructure;
}

export interface ManagedOrder {
  orderId: string;
  state: OrderState;
  request: ExecutionOrderRequest;
  filledQuantity: number;
  remainingQuantity: number;
  averageFillPrice: number | null;
  executionDelayMs: number;
  rejectionReason?: string;
}

export interface FillResult {
  fillId: string;
  price: number;
  quantity: number;
  liquidityRole: LiquidityRole;
  fee: number;
}

export interface FeeBreakdown {
  makerFee: number;
  takerFee: number;
  tradingFee: number;
  commission: number;
  fundingFee: number;
  totalFee: number;
}

export interface FundingCharge {
  fundingRate: number;
  fundingFee: number;
  intervalHours: number;
}

export interface SlippageEstimate {
  entrySlippage: number;
  exitSlippage: number;
  slippageRate: number;
}

export interface ExecutionResult {
  order: ManagedOrder;
  fills: FillResult[];
  fees: FeeBreakdown;
  funding: FundingCharge;
  entryPrice: number;
  exitPrice?: number;
  averageFillPrice: number;
  executionDelayMs: number;
  fillRatio: number;
  entrySlippage: number;
  exitSlippage: number;
  portfolioApproval: PortfolioApproval;
}

export interface ExecutionSummary {
  totalOrders: number;
  averageSlippage: number;
  averageFees: number;
  fundingCost: number;
  fillRatio: number;
  averageFillTimeMs: number;
  rejectedOrders: number;
  cancelledOrders: number;
}
