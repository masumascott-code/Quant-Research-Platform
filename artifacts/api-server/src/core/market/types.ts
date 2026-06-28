export interface MarketCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type MarketRegime =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "SIDEWAYS"
  | "VOLATILE"
  | "COMPRESSION"
  | "EXPANSION";

export type MarketSession = "ASIAN" | "LONDON" | "NEW_YORK" | "SYDNEY";

export interface MarketCandidate {
  symbol: string;
  direction: "LONG" | "SHORT";
  candles: MarketCandle[];
  signalScore?: number;
  rrRatio?: number;
}

export interface RegimeResult {
  regime: MarketRegime;
  strength: number;
  confidence: number;
}

export interface SessionResult {
  session: MarketSession;
  overlap: string | null;
  qualityScore: number;
}

export interface LiquidityResult {
  liquiditySweep: boolean;
  stopHunt: boolean;
  falseBreakout: boolean;
  equalHigh: boolean;
  equalLow: boolean;
  liquidityVoid: boolean;
  swingFailurePattern: boolean;
  score: number;
}

export interface VolumeResult {
  relativeVolume: number;
  volumeSpike: boolean;
  deltaApproximation: number;
  volumeExpansion: boolean;
  volumeContraction: boolean;
  buyingPressure: number;
  sellingPressure: number;
  score: number;
}

export interface VolatilityResult {
  atr: number;
  atrExpansion: boolean;
  atrCompression: boolean;
  historicalVolatility: number;
  volatilityPercentile: number;
  score: number;
}

export interface TrendResult {
  emaAlignment: "BULLISH" | "BEARISH" | "MIXED";
  adx: number;
  marketStructure: "HIGHER_HIGH" | "LOWER_LOW" | "RANGE";
  higherHigh: boolean;
  lowerLow: boolean;
  breakOfStructure: boolean;
  changeOfCharacter: boolean;
  score: number;
}

export interface MarketContext {
  symbol: string;
  direction: "LONG" | "SHORT";
  marketRegime: RegimeResult;
  session: SessionResult;
  liquidity: LiquidityResult;
  volume: VolumeResult;
  volatility: VolatilityResult;
  trend: TrendResult;
  confidence: number;
  liquidityScore: number;
  trendScore: number;
  volumeScore: number;
  volatilityScore: number;
  opportunityRank: number | null;
  riskGrade: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
}

export interface RankedOpportunities {
  all: MarketContext[];
  top5: MarketContext[];
  top10: MarketContext[];
  bestLong: MarketContext | null;
  bestShort: MarketContext | null;
  highestConfidence: MarketContext | null;
  highestMomentum: MarketContext | null;
}

export interface MarketOverview {
  totalCandidates: number;
  strongestTrends: MarketContext[];
  weakestTrends: MarketContext[];
  bestOpportunities: MarketContext[];
  highestRiskAssets: MarketContext[];
  sessionSummary: Record<string, number>;
}
