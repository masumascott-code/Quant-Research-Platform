import type { MarketCandle, MarketContext } from "../market";
import type { ScannerDecisionRuntimeConfig, ScannerMode } from "../config";

export interface TechnicalSignalInput {
  score: number;
  grade: "A+" | "A" | null;
  confidence: string;
  direction: "LONG" | "SHORT";
  setupType?: string;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rrRatio: number;
  reason: string;
  trendScore?: number;
  emaScore?: number;
  volumeScore?: number;
  rvolScore?: number;
  breakoutScore?: number;
  retestScore?: number;
  structureScore?: number;
  momentumScore?: number;
}

export interface ScannerCandidateInput {
  symbol: string;
  direction: "LONG" | "SHORT";
  candles: MarketCandle[];
  technicalSignal: TechnicalSignalInput;
  shortProtection?: ShortProtectionDiagnostic;
}

export interface ScoreBreakdown {
  finalScore: number;
  technicalScore: number;
  marketRegimeScore: number;
  liquidityScore: number;
  volumeScore: number;
  trendScore: number;
  volatilityScore: number;
  sessionScore: number;
  riskRewardScore: number;
  weights: Pick<
    ScannerDecisionRuntimeConfig,
    | "technicalWeight"
    | "marketRegimeWeight"
    | "liquidityWeight"
    | "volumeWeight"
    | "trendWeight"
    | "volatilityWeight"
    | "sessionWeight"
    | "riskRewardWeight"
  >;
}

export type ScannerSignalGrade = "A+" | "A" | "B" | "C" | "Rejected";
export type ScannerTradeGrade = "A+" | "A" | "B" | "C";
export type ScannerScoreDecision = "TRADE_ELIGIBLE" | "WATCHLIST" | "REJECTED";

export interface ScannerExplanation {
  whySelected: string[];
  whyRejected: string[];
  confidenceFactors: string[];
  riskFactors: string[];
  marketContext: {
    regime: string;
    session: string;
    confidence: number;
    opportunityRank: number | null;
  };
}

export interface MarketFilterInput {
  context: MarketContext;
  duplicateActiveSignal: boolean;
  portfolioAllowed: boolean;
  portfolioReason?: string | null;
}

export interface MarketFilterResult {
  accepted: boolean;
  rejectedReasons: string[];
  riskSummary: string[];
}

export interface ScannerComponentScores {
  trendScore?: number;
  emaAlignmentScore?: number;
  volumeScore?: number;
  rvolScore?: number;
  breakoutScore?: number;
  retestScore?: number;
  structureScore?: number;
  momentumScore?: number;
  marketRegimeScore?: number;
  liquidityScore?: number;
  volatilityScore?: number;
  sessionScore?: number;
  riskRewardScore?: number;
}

export interface ShortProtectionDiagnostic {
  priceChangePercent: number | null;
  distanceFromEMA20: number | null;
  distanceFromEMA50: number | null;
  isShortOverextended: boolean;
  hasBearishRetest: boolean;
  marketRegime: string | null;
  btcTrendBias: string | null;
  shortProtectionWouldBlock: boolean;
  shortProtectionReasons: string[];
  diagnosticOnly: boolean;
}

export interface ScannerDecisionResult {
  accepted: boolean;
  scannerMode: ScannerMode;
  finalScore: number;
  technicalScore: number;
  signalGrade: ScannerSignalGrade;
  tradeGrade: ScannerTradeGrade;
  scoreDecision: ScannerScoreDecision;
  scoreDecisionReason: string;
  strategy: string;
  marketRegime: string;
  confidence: number;
  opportunityRank: number | null;
  reasons: string[];
  riskSummary: string[];
  context: MarketContext;
  scoreBreakdown: ScoreBreakdown;
  componentScores: ScannerComponentScores;
  rejectionStage: string | null;
  rejectionReason: string | null;
  blockedReason: string | null;
  shortProtection?: ShortProtectionDiagnostic;
  explanation: ScannerExplanation;
}

export interface ScannerQualityReport {
  totalDecisions: number;
  topRejectedReasons: Array<{ reason: string; count: number }>;
  topAcceptedSetups: Array<{ strategy: string; count: number }>;
  signalDistribution: Record<ScannerSignalGrade, number>;
  averageConfidence: number;
  strategyPerformanceSummary: Array<{ strategy: string; accepted: number; rejected: number }>;
}
