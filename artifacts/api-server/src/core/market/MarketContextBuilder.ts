import { ConfidenceEngine } from "./ConfidenceEngine";
import { LiquidityEngine } from "./LiquidityEngine";
import { MarketRegimeDetector } from "./MarketRegimeDetector";
import { SessionDetector } from "./SessionDetector";
import { TrendStrengthEngine } from "./TrendStrengthEngine";
import { VolatilityEngine } from "./VolatilityEngine";
import { VolumeProfileEngine } from "./VolumeProfileEngine";
import type { MarketCandidate, MarketContext } from "./types";

export class MarketContextBuilder {
  constructor(
    private readonly regimeDetector = new MarketRegimeDetector(),
    private readonly sessionDetector = new SessionDetector(),
    private readonly liquidityEngine = new LiquidityEngine(),
    private readonly volumeEngine = new VolumeProfileEngine(),
    private readonly volatilityEngine = new VolatilityEngine(),
    private readonly trendEngine = new TrendStrengthEngine(),
    private readonly confidenceEngine = new ConfidenceEngine()
  ) {}

  build(candidate: MarketCandidate, date = new Date()): MarketContext {
    const marketRegime = this.regimeDetector.detect(candidate.candles);
    const session = this.sessionDetector.detect(date);
    const liquidity = this.liquidityEngine.analyze(candidate.candles);
    const volume = this.volumeEngine.analyze(candidate.candles);
    const volatility = this.volatilityEngine.analyze(candidate.candles);
    const trend = this.trendEngine.analyze(candidate.candles);
    const confidence = this.confidenceEngine.score({
      regime: marketRegime,
      trend,
      liquidity,
      volume,
      volatility,
      session,
      rrRatio: candidate.rrRatio,
      signalQuality: candidate.signalScore,
    });

    return {
      symbol: candidate.symbol,
      direction: candidate.direction,
      marketRegime,
      session,
      liquidity,
      volume,
      volatility,
      trend,
      confidence,
      liquidityScore: liquidity.score,
      trendScore: trend.score,
      volumeScore: volume.score,
      volatilityScore: volatility.score,
      opportunityRank: null,
      riskGrade: this.riskGrade(confidence, liquidity.score, volatility.score),
    };
  }

  private riskGrade(confidence: number, liquidityScore: number, volatilityScore: number): MarketContext["riskGrade"] {
    if (volatilityScore >= 90 && liquidityScore >= 70) return "EXTREME";
    if (confidence < 45 || volatilityScore >= 80) return "HIGH";
    if (confidence < 65) return "MEDIUM";
    return "LOW";
  }
}
