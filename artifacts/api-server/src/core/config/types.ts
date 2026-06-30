export interface ScannerRuntimeConfig {
  binanceBaseUrl: string;
  scanIntervalMs: number;
  minVolume24h: number;
  minRvol: number;
  topListSize: number;
  analysisListSize: number;
  symbolCooldownMs: number;
  watchlistCheckCooldownMs: number;
  excludedSymbolPrefixes: string[];
  quoteAsset: string;
  candles15mLimit: number;
  candles5mLimit: number;
  candlesH1Limit: number;
  minCandles15m: number;
  volumeLookback: number;
  snapshotRvolFallback: number;
  signalTtlMs: number;
  watchlistTtlMs: number;
  snapshotFreshnessWindowMs: number;
  minScoreTrade: number;
  minScoreWatchlist: number;
  maxOpenTrades: number;
  maxDailyTrades: number;
  maxWeeklyTrades: number;
}

export interface SignalRuntimeConfig {
  emaFastPeriod: number;
  emaSlowPeriod: number;
  emaTrendPeriod: number;
  atrPeriod: number;
  rvolLookback: number;
  minCandles15m: number;
  structureLookback: number;
  breakoutLookback: number;
  retestTolerance: number;
  setupRetestTolerance: number;
  fakeoutWickRatio: number;
  fakeoutVolumeRatio: number;
  candleBodyRatio: number;
  momentumCandles: number;
  mtfMinCandles: number;
  minTimeframeAlignment: number;
  timeframeScoreMultiplier: number;
  minAnalysisScore: number;
  maxScore: number;
  volumeExpansionRvol: number;
  emaPullbackTolerance: number;
  supportResistanceTolerance: number;
  supportResistanceLookback: number;
  supportResistanceBaseLookback: number;
  swingLookback: number;
  atrSwingBuffer: number;
  atrEmaBuffer: number;
  atrMaxStopBuffer: number;
  maxRiskPercent: number;
  tp1RiskMultiple: number;
  tp2RiskMultiple: number;
  tp3RiskMultiple: number;
  minRrRatio: number;
  gradeAPlusScore: number;
  confidenceExtremeScore: number;
  confidenceVeryHighScore: number;
  confidenceHighScore: number;
  confidenceMediumScore: number;
  volumeScoreVeryHigh: number;
  volumeScoreHigh: number;
  volumeScoreMedium: number;
  volumeScoreMin: number;
  rvolScoreExtreme: number;
  rvolScoreVeryHigh: number;
  rvolScoreHigh: number;
  rvolScoreMediumHigh: number;
  rvolScoreMin: number;
}

export interface RiskRuntimeConfig {
  riskPercent: number;
  cooldownMinutes: number;
  maxConsecutiveLosses: number;
  pauseAfterLossesMinutes: number;
  dailyDrawdownLimitPercent: number;
  maxDrawdownPercent: number;
  emergencyPauseMinutes: number;
  manualPauseDefaultMinutes: number;
  recentLossLookback: number;
  maxExposurePercent: number;
  maxPortfolioRiskPercent: number;
  maxAccountRiskPercent: number;
  maxSectorExposurePercent: number;
  maxCoinExposurePercent: number;
  killSwitch: boolean;
}

export interface PaperTradingRuntimeConfig {
  defaultEquity: number;
  defaultLeverage: number;
  fixedTradeNotional: number;
  tradingFeeRate: number;
  makerFeeRate: number;
  takerFeeRate: number;
  commissionRate: number;
  slippageRate: number;
  fundingRate: number;
  fundingIntervalHours: number;
  defaultQuantity: number;
  breakEvenPnlThreshold: number;
}

export interface PriceTrackerRuntimeConfig {
  binanceBaseUrl: string;
  pollIntervalMs: number;
  symbolRefreshMs: number;
  fetchTimeoutMs: number;
}

export interface SlMonitorRuntimeConfig {
  checkIntervalMs: number;
}

export interface ScannerDecisionRuntimeConfig {
  technicalWeight: number;
  marketRegimeWeight: number;
  liquidityWeight: number;
  volumeWeight: number;
  trendWeight: number;
  volatilityWeight: number;
  sessionWeight: number;
  riskRewardWeight: number;
  minConfidence: number;
  minLiquidityScore: number;
  minSessionQuality: number;
  minVolatilityScore: number;
  maxVolatilityScore: number;
  maxRiskGrade: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  gradeAPlusThreshold: number;
  gradeAThreshold: number;
  gradeBThreshold: number;
  strategyTrendingBull: string;
  strategyTrendingBear: string;
  strategySideways: string;
  strategyVolatile: string;
  strategyCompression: string;
  strategyExpansion: string;
}

export interface AIRuntimeConfig {
  enabled: boolean;
  modelName: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  cacheTtlMs: number;
  rateLimitPerMinute: number;
}

export interface NotificationsRuntimeConfig {
  telegramEnabled: boolean;
}

export interface RuntimeConfig {
  scanner: ScannerRuntimeConfig;
  signal: SignalRuntimeConfig;
  risk: RiskRuntimeConfig;
  paperTrading: PaperTradingRuntimeConfig;
  priceTracker: PriceTrackerRuntimeConfig;
  slMonitor: SlMonitorRuntimeConfig;
  scannerDecision: ScannerDecisionRuntimeConfig;
  ai: AIRuntimeConfig;
  notifications: NotificationsRuntimeConfig;
}

export type RuntimeConfigValue = string | number | boolean | string[];
export type FlatRuntimeConfig = Record<string, RuntimeConfigValue>;
