import type { executionService } from "../execution";
import type { portfolioService } from "../portfolio";
import type { TradeAnalysisInput, TradeSignalInput, PaperTradeRecord, tradeService } from "../trading";

export interface OHLCVBar {
  symbol: string;
  timeframe: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickData {
  symbol: string;
  timestamp: Date;
  price: number;
  quantity?: number;
  bid?: number;
  ask?: number;
}

export interface ReplayFrame {
  symbol: string;
  timestamp: Date;
  primary: OHLCVBar;
  multiTimeframe: Record<string, OHLCVBar | null>;
  tick?: TickData;
  index: number;
}

export interface HistoricalDataset {
  symbol: string;
  exchange: string;
  timeframe: string;
  bars: OHLCVBar[];
  ticks?: TickData[];
  higherTimeframes?: Record<string, OHLCVBar[]>;
}

export type BacktestOrderIntent =
  | { type: "ENTER"; signal: TradeSignalInput; analysis: TradeAnalysisInput }
  | { type: "EXIT"; exitPrice: number; exitReason: string }
  | { type: "HOLD" };

export interface ResearchStrategy {
  id: string;
  version: string;
  name: string;
  onStart?(context: StrategyRuntimeContext): Promise<void> | void;
  onBar(frame: ReplayFrame, context: StrategyRuntimeContext): Promise<BacktestOrderIntent> | BacktestOrderIntent;
  onTick?(tick: TickData, context: StrategyRuntimeContext): Promise<BacktestOrderIntent> | BacktestOrderIntent;
  onComplete?(context: StrategyRuntimeContext): Promise<void> | void;
}

export interface StrategyRuntimeContext {
  parameters: Record<string, unknown>;
  openTrade: PaperTradeRecord | null;
  equity: number;
  services: {
    tradeService: typeof tradeService;
    executionService: typeof executionService;
    portfolioService: typeof portfolioService;
  };
}

export interface ResearchTrade {
  symbol: string;
  direction: string;
  entryAt: Date;
  exitAt: Date | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  rMultiple: number;
  riskAmount: number;
  holdMinutes: number;
  fees: number;
  sourceTradeId?: number;
}

export interface EquityPoint {
  timestamp: Date;
  equity: number;
  drawdown: number;
}

export interface PerformanceMetrics {
  winRate: number;
  profitFactor: number;
  expectancy: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  averageHoldMinutes: number;
  averageRMultiple: number;
  averageRisk: number;
  totalReturn: number;
  tradeCount: number;
  equityCurve: EquityPoint[];
}

export interface BacktestRequest {
  strategy: ResearchStrategy;
  dataset: HistoricalDataset;
  parameters?: Record<string, unknown>;
  initialEquity: number;
  strategyVersionId?: number;
  parameterSetId?: number;
  marketRegime?: string;
  notes?: string;
  persistResults?: boolean;
}

export interface BacktestResult {
  runId: string;
  status: "COMPLETED" | "FAILED";
  trades: ResearchTrade[];
  metrics: PerformanceMetrics;
  startedAt: Date;
  completedAt: Date;
  error?: string;
}

export interface BenchmarkResult {
  name: string;
  symbol: string;
  totalReturn: number;
  finalEquity: number;
  maxDrawdown: number;
  equityCurve: EquityPoint[];
}

export interface ParameterCandidate {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ParameterOptimizationResult {
  best: ParameterCandidate;
  score: number;
  results: Array<{ candidate: ParameterCandidate; score: number; metrics: PerformanceMetrics }>;
}

export interface WalkForwardWindow {
  index: number;
  trainingStart: Date;
  trainingEnd: Date;
  validationStart: Date;
  validationEnd: Date;
}

export interface WalkForwardRequest {
  strategy: ResearchStrategy;
  dataset: HistoricalDataset;
  candidates: ParameterCandidate[];
  initialEquity: number;
  trainingWindowBars: number;
  validationWindowBars: number;
  stepBars?: number;
}

export interface WalkForwardSummary {
  windows: Array<{
    window: WalkForwardWindow;
    selected: ParameterCandidate;
    trainingScore: number;
    validationScore: number;
    validationMetrics: PerformanceMetrics;
  }>;
  aggregateMetrics: PerformanceMetrics;
}
