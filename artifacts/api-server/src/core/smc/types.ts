export type SmcDirection = "bullish" | "bearish";
export type TradeDirection = "LONG" | "SHORT";
export type HtfBias = "bullish" | "bearish" | "neutral";

export interface SmcCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface SwingPoint {
  type: "high" | "low";
  index: number;
  time: number;
  price: number;
  strength: number;
}

export interface StructureEvent {
  type: "BOS" | "CHOCH" | "MSS";
  direction: SmcDirection;
  index: number;
  time: number;
  brokenLevel: number;
  confirmationClose: number;
  strength: number;
}

export interface LiquidityLevel {
  type: "equalHigh" | "equalLow" | "previousHigh" | "previousLow" | "swingHigh" | "swingLow";
  side: "buySide" | "sellSide";
  price: number;
  indices: number[];
  time: number;
  strength: number;
}

export interface LiquiditySweep {
  sweptLevel: number;
  sweepDirection: "sellSide" | "buySide";
  index: number;
  time: number;
  wickSize: number;
  closeRecoveryConfirmed: boolean;
  strength: number;
}

export interface Displacement {
  direction: SmcDirection;
  index: number;
  time: number;
  bodySize: number;
  averageBody: number;
  rvol: number;
  strength: number;
  createsImbalance: boolean;
}

export interface FairValueGap {
  direction: SmcDirection;
  lower: number;
  upper: number;
  midpoint: number;
  startTime: number;
  endTime: number;
  startIndex: number;
  endIndex: number;
  size: number;
  freshness: number;
  mitigated: boolean;
  score: number;
}

export interface OrderBlock {
  direction: SmcDirection;
  low: number;
  high: number;
  open: number;
  close: number;
  originTime: number;
  originIndex: number;
  freshness: number;
  mitigated: boolean;
  score: number;
}

export interface PremiumDiscountZone {
  swingHigh: number;
  swingLow: number;
  equilibrium: number;
  zone: "premium" | "discount" | "equilibrium";
  validForDirection: boolean;
  score: number;
}

export interface SmcRiskPlan {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number;
  risk: number;
  reward: number;
}

export interface SmcScoreBreakdown {
  htfBias: number;
  liquiditySweep: number;
  structure: number;
  displacement: number;
  poi: number;
  premiumDiscount: number;
  riskReward: number;
  total: number;
}

export interface SmcAnalysisInput {
  symbol: string;
  direction: TradeDirection;
  currentPrice: number;
  volume24h: number;
  candles5m: SmcCandle[];
  candles15m: SmcCandle[];
  candles1h: SmcCandle[];
  candles4h: SmcCandle[];
  config: {
    minRiskReward: number;
    requireHtfBias: boolean;
    requireLiquiditySweep: boolean;
    requireBOSorCHOCH: boolean;
    requireFvgOrOrderBlock: boolean;
    requirePremiumDiscount: boolean;
    minSmcScoreTrade: number;
    minSmcScoreWatchlist: number;
    allowWatchlistWithoutEntry: boolean;
    useFibonacciConfluence?: boolean;
  };
}

export interface SmcSignalAnalysis {
  symbol: string;
  direction: TradeDirection;
  decision: "ACCEPTED" | "WATCHLIST" | "REJECTED";
  reason: string;
  score: number;
  grade: "A+" | "A" | "B" | null;
  confidence: "Low" | "Medium" | "High" | "Very High" | "Extreme";
  setupType: string;
  strategyLabel: string;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rrRatio: number;
  slReason: string;
  whyNow: string;
  whyNotEarlier: string;
  whyLong: string;
  whySl: string;
  whyTp: string;
  timeframeAlignment: string;
  trendScore: number;
  emaScore: number;
  volumeScore: number;
  rvolScore: number;
  breakoutScore: number;
  retestScore: number;
  structureScore: number;
  momentumScore: number;
  htfBias: HtfBias;
  sweep: LiquiditySweep | null;
  structureEvent: StructureEvent | null;
  displacement: Displacement | null;
  fvg: FairValueGap | null;
  orderBlock: OrderBlock | null;
  premiumDiscount: PremiumDiscountZone | null;
  scoreBreakdown: SmcScoreBreakdown;
  details: Record<string, unknown>;
}

export interface SmcDiagnostic {
  symbol: string;
  direction: TradeDirection;
  decision: "ACCEPTED" | "REJECTED" | "WATCHLIST" | "SKIPPED";
  source: "SMC";
  reason: string;
  strategyLabel?: string;
  htfBias: HtfBias;
  liquiditySweep: string;
  structure: string;
  fvg: string;
  orderBlock: string;
  premiumDiscount: string;
  fibonacci: string;
  riskReward: string;
  smcScore: number;
  paperTradeOpened: boolean;
  paperTradeId?: string | null;
  paperTradeBlockedReason?: string | null;
  details: Record<string, unknown>;
}
