export type LearningRecommendationCategory =
  | "SCANNER_WEIGHTS"
  | "CONFIDENCE_THRESHOLD"
  | "LIQUIDITY_THRESHOLD"
  | "RVOL_THRESHOLD"
  | "RISK_PERCENTAGE"
  | "SESSION_PREFERENCE"
  | "STRATEGY_PREFERENCE";

export type RecommendationStatus =
  | "PENDING_HUMAN_APPROVAL"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED";

export interface LearningTrade {
  id?: number;
  tradeId: string;
  symbol: string;
  direction: string;
  setupType?: string | null;
  status: string;
  result?: string | null;
  signalScore: number;
  pnl: number;
  pnlPercent?: number | null;
  maxDrawdown?: number | null;
  maxProfit?: number | null;
  holdingDurationMinutes?: number | null;
  openedAt?: Date;
  closedAt?: Date | null;
}

export interface LearningTradeReview {
  tradeId: string;
  symbol: string;
  direction: string;
  result: string;
  analysisReason: string;
  lessonsLearned: string;
  improvementNotes?: string | null;
  setupQuality?: string | null;
  winningFactors?: string | null;
  losingFactors?: string | null;
  createdAt?: Date;
}

export interface LearningSetupStat {
  setupType: string;
  direction: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  avgPnl: number;
  avgScore: number;
  ranking?: number | null;
}

export interface LearningPerformanceMetric {
  scope: string;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  sharpeRatio: number;
  maxDrawdown: number;
  averageRisk: number;
  totalReturn: number;
  tradeCount: number;
  createdAt?: Date;
}

export interface LearningBacktest {
  runId: string;
  status: string;
  symbol?: string | null;
  timeframe: string;
  marketRegime?: string | null;
  initialEquity: number;
  finalEquity?: number | null;
  createdAt?: Date;
  completedAt?: Date | null;
}

export interface LearningMarketContext {
  symbol: string;
  marketRegime: string;
  session: string;
  confidence: number;
  liquidityScore: number;
  trendScore: number;
  volumeScore: number;
  volatilityScore: number;
  riskGrade: string;
  createdAt?: Date;
}

export interface LearningExecutionMetric {
  symbol: string;
  status: string;
  entrySlippage: number;
  exitSlippage: number;
  executionDelayMs: number;
  fillRatio: number;
  createdAt?: Date;
}

export interface LearningPortfolioMetric {
  totalEquity: number;
  freeEquity: number;
  openExposure: number;
  dailyPnl: number;
  riskUsagePercent: number;
  updatedAt?: Date;
}

export interface LearningDataset {
  generatedAt: string;
  lookbackDays: number;
  trades: LearningTrade[];
  tradeReviews: LearningTradeReview[];
  setupStats: LearningSetupStat[];
  performanceMetrics: LearningPerformanceMetric[];
  backtests: LearningBacktest[];
  marketContexts: LearningMarketContext[];
  executionMetrics: LearningExecutionMetric[];
  portfolioMetrics: LearningPortfolioMetric[];
}

export interface MistakePattern {
  key: string;
  label: string;
  count: number;
  severity: number;
  evidence: string[];
}

export interface MistakeAnalysis {
  repeatedMistakes: MistakePattern[];
  highRiskBehaviours: MistakePattern[];
  traderDisciplineScore: number;
  summary: string;
}

export interface StrategyFinding {
  strategy: string;
  direction: string;
  totalTrades: number;
  winRate: number;
  avgPnl: number;
  avgScore: number;
  confidence: number;
  rationale: string;
}

export interface StrategyOptimization {
  strongStrategies: StrategyFinding[];
  weakStrategies: StrategyFinding[];
  preferredStrategy?: StrategyFinding;
  avoidedStrategy?: StrategyFinding;
  consistencyScore: number;
}

export interface ConfidenceCalibration {
  currentAverageScore: number;
  recommendedMinimumScore: number;
  lowScoreLossRate: number;
  highScoreWinRate: number;
  confidence: number;
  rationale: string;
}

export interface SessionFinding {
  session: string;
  trades: number;
  winRate: number;
  pnl: number;
}

export interface SessionOptimization {
  bestSession?: SessionFinding;
  worstSession?: SessionFinding;
  sessions: SessionFinding[];
}

export interface RegimeFinding {
  regime: string;
  observations: number;
  avgConfidence: number;
  avgRisk: number;
  avgTrend: number;
  suitabilityScore: number;
}

export interface MarketRegimeOptimization {
  bestRegime?: RegimeFinding;
  worstRegime?: RegimeFinding;
  regimes: RegimeFinding[];
}

export interface LearningRecommendation {
  recommendationId: string;
  category: LearningRecommendationCategory;
  target: string;
  currentValue: unknown;
  recommendedValue: unknown;
  rationale: string;
  confidence: number;
  impactEstimate: number;
  evidence: Record<string, unknown>;
  status: RecommendationStatus;
  requiresHumanApproval: true;
}

export interface EdgeScores {
  improvementScore: number;
  learningScore: number;
  edgeScore: number;
  traderDisciplineScore: number;
  consistencyScore: number;
  components: Record<string, number>;
}

export interface LearningReport {
  title: string;
  period: "WEEKLY" | "MONTHLY";
  summary: string;
  scores: EdgeScores;
  strongestEdges: string[];
  weakestEdges: string[];
  recommendations: LearningRecommendation[];
}

export interface ImprovementTimelinePoint {
  date: string;
  improvementScore: number;
  learningScore: number;
  edgeScore: number;
}

export interface StrategyEvolutionPoint {
  strategy: string;
  winRate: number;
  avgPnl: number;
  totalTrades: number;
}

export interface AdaptiveLearningResult {
  runId: string;
  generatedAt: string;
  lookbackDays: number;
  scores: EdgeScores;
  mistakeAnalysis: MistakeAnalysis;
  strategyOptimization: StrategyOptimization;
  confidenceCalibration: ConfidenceCalibration;
  sessionOptimization: SessionOptimization;
  marketRegimeOptimization: MarketRegimeOptimization;
  recommendations: LearningRecommendation[];
  weeklyReport: LearningReport;
  monthlyReport: LearningReport;
  improvementTimeline: ImprovementTimelinePoint[];
  strategyEvolution: StrategyEvolutionPoint[];
  edgeEvolution: ImprovementTimelinePoint[];
  persisted: boolean;
  advisoryOnly: true;
}
