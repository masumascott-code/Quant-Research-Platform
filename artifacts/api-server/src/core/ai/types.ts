import type { AIRuntimeConfig } from "../config";

export type AIPromptTemplate =
  | "TRADE_REVIEW"
  | "TRADE_EXPLANATION"
  | "DAILY_REPORT"
  | "WEEKLY_REPORT"
  | "MISTAKE_DETECTION"
  | "STRATEGY_REVIEW"
  | "MARKET_SUMMARY"
  | "PERFORMANCE_ANALYSIS";

export interface AIMessage {
  role: "system" | "user";
  content: string;
}

export interface AIRequest {
  template: AIPromptTemplate;
  messages: AIMessage[];
  cacheKey?: string;
  metadata?: Record<string, unknown>;
}

export interface AIResponse {
  text: string;
  model: string;
  cached: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface AIProvider {
  generate(request: AIRequest, config: AIRuntimeConfig): Promise<AIResponse>;
}

export interface MarketContextSummary {
  symbol?: string;
  marketRegime?: string;
  session?: string;
  confidence?: number;
  liquidityScore?: number;
  trendScore?: number;
  volumeScore?: number;
  volatilityScore?: number;
  riskGrade?: string;
}

export interface ScannerDecisionSummary {
  symbol: string;
  direction: string;
  decision: string;
  strategy: string;
  finalScore: number;
  confidence: number;
  marketRegime: string;
  riskGrade: string;
  reasons: unknown;
}

export interface PortfolioContextSummary {
  equity?: number;
  availableBalance?: number;
  usedMargin?: number;
  freeMargin?: number;
  openExposure?: number;
  dailyPnl?: number;
  winRate?: number;
  riskUsagePercent?: number;
}

export interface TradeContextSummary {
  symbol: string;
  direction: string;
  status: string;
  setupType?: string | null;
  entryPrice: number;
  stopLoss: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  quantity?: number;
  signalScore?: number;
  result?: string | null;
  pnl?: number | null;
  openedAt?: Date;
  closedAt?: Date | null;
}

export interface ExecutionContextSummary {
  totalExecutions?: number;
  averageSlippage?: number;
  averageFillRatio?: number;
  averageDelayMs?: number;
}

export interface ResearchContextSummary {
  latestBacktestReturn?: number;
  latestWinRate?: number;
  latestProfitFactor?: number;
  latestMaxDrawdown?: number;
  tradeCount?: number;
}

export interface JournalContextSummary {
  notes?: string[];
  repeatedErrors?: string[];
  lessons?: string[];
}

export interface AIContext {
  generatedAt: string;
  market?: MarketContextSummary;
  scannerDecision?: ScannerDecisionSummary;
  portfolio?: PortfolioContextSummary;
  openTrades?: TradeContextSummary[];
  closedTrades?: TradeContextSummary[];
  execution?: ExecutionContextSummary;
  research?: ResearchContextSummary;
  performance?: ResearchContextSummary;
  journal?: JournalContextSummary;
}

export interface ParsedAIInsight {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  riskFactors: string[];
  suggestedImprovements: string[];
  alternativeScenarios: string[];
  confidenceExplanation: string;
  rawText: string;
}

export class AIProviderError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly cause?: unknown) {
    super(message);
    this.name = "AIProviderError";
  }
}
