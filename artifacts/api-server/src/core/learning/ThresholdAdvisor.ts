import type {
  ConfidenceCalibration,
  LearningDataset,
  LearningRecommendation,
  MarketRegimeOptimization,
  MistakeAnalysis,
  SessionOptimization,
  StrategyOptimization,
} from "./types";

export class ThresholdAdvisor {
  recommend(params: {
    dataset: LearningDataset;
    mistakes: MistakeAnalysis;
    strategies: StrategyOptimization;
    confidence: ConfidenceCalibration;
    sessions: SessionOptimization;
    regimes: MarketRegimeOptimization;
  }): LearningRecommendation[] {
    const recommendations: LearningRecommendation[] = [];
    const prefix = `learn-${Date.now()}`;

    recommendations.push({
      recommendationId: `${prefix}-confidence-threshold`,
      category: "CONFIDENCE_THRESHOLD",
      target: "scanner.minimumSignalScore",
      currentValue: params.confidence.currentAverageScore,
      recommendedValue: params.confidence.recommendedMinimumScore,
      rationale: params.confidence.rationale,
      confidence: params.confidence.confidence,
      impactEstimate: impactFromLossRate(params.confidence.lowScoreLossRate),
      evidence: {
        lowScoreLossRate: params.confidence.lowScoreLossRate,
        highScoreWinRate: params.confidence.highScoreWinRate,
      },
      status: "PENDING_HUMAN_APPROVAL",
      requiresHumanApproval: true,
    });

    if (params.strategies.preferredStrategy) {
      recommendations.push({
        recommendationId: `${prefix}-strategy-preference`,
        category: "STRATEGY_PREFERENCE",
        target: "scanner.strategyPreference",
        currentValue: "current_mix",
        recommendedValue: {
          prefer: params.strategies.preferredStrategy.strategy,
          direction: params.strategies.preferredStrategy.direction,
          avoid: params.strategies.avoidedStrategy?.strategy,
        },
        rationale: params.strategies.preferredStrategy.rationale,
        confidence: params.strategies.preferredStrategy.confidence,
        impactEstimate: Math.max(5, params.strategies.preferredStrategy.winRate * 30),
        evidence: {
          strongStrategies: params.strategies.strongStrategies,
          weakStrategies: params.strategies.weakStrategies,
        },
        status: "PENDING_HUMAN_APPROVAL",
        requiresHumanApproval: true,
      });
    }

    if (params.sessions.bestSession) {
      recommendations.push({
        recommendationId: `${prefix}-session-preference`,
        category: "SESSION_PREFERENCE",
        target: "scanner.sessionPreference",
        currentValue: "all_sessions",
        recommendedValue: {
          prefer: params.sessions.bestSession.session,
          reduce: params.sessions.worstSession?.session,
        },
        rationale: `${params.sessions.bestSession.session} has the strongest observed session performance.`,
        confidence: Math.min(100, params.sessions.bestSession.trades * 12),
        impactEstimate: Math.max(5, Math.abs(params.sessions.bestSession.pnl)),
        evidence: { sessions: params.sessions.sessions },
        status: "PENDING_HUMAN_APPROVAL",
        requiresHumanApproval: true,
      });
    }

    recommendations.push({
      recommendationId: `${prefix}-risk-percentage`,
      category: "RISK_PERCENTAGE",
      target: "risk.maxRiskPercent",
      currentValue: average(params.dataset.portfolioMetrics.map((metric) => metric.riskUsagePercent)),
      recommendedValue: riskRecommendation(params.mistakes),
      rationale: "Risk percentage recommendation is based on drawdown, portfolio risk usage, and execution quality. Human approval is required.",
      confidence: Math.max(40, 100 - params.mistakes.highRiskBehaviours.length * 15),
      impactEstimate: params.mistakes.highRiskBehaviours.length * 10,
      evidence: { highRiskBehaviours: params.mistakes.highRiskBehaviours },
      status: "PENDING_HUMAN_APPROVAL",
      requiresHumanApproval: true,
    });

    recommendations.push({
      recommendationId: `${prefix}-liquidity-threshold`,
      category: "LIQUIDITY_THRESHOLD",
      target: "market.minimumLiquidityScore",
      currentValue: average(params.dataset.marketContexts.map((context) => context.liquidityScore)),
      recommendedValue: recommendedThreshold(params.dataset.marketContexts.map((context) => context.liquidityScore), 65),
      rationale: "Liquidity threshold recommendation comes from recent market context quality and execution friction.",
      confidence: Math.min(100, params.dataset.marketContexts.length * 8),
      impactEstimate: executionFriction(params.dataset) * 100,
      evidence: {
        averageFillRatio: average(params.dataset.executionMetrics.map((metric) => metric.fillRatio)),
        averageLiquidity: average(params.dataset.marketContexts.map((context) => context.liquidityScore)),
      },
      status: "PENDING_HUMAN_APPROVAL",
      requiresHumanApproval: true,
    });

    recommendations.push({
      recommendationId: `${prefix}-rvol-threshold`,
      category: "RVOL_THRESHOLD",
      target: "scanner.minimumRvol",
      currentValue: "current_config",
      recommendedValue: params.regimes.bestRegime?.suitabilityScore && params.regimes.bestRegime.suitabilityScore >= 70 ? "maintain" : "raise_one_step",
      rationale: "RVOL recommendation is inferred from market-regime suitability and should be reviewed before any config change.",
      confidence: params.regimes.bestRegime ? Math.min(100, params.regimes.bestRegime.observations * 10) : 35,
      impactEstimate: params.regimes.bestRegime ? Math.max(5, 100 - params.regimes.bestRegime.suitabilityScore) : 5,
      evidence: { regimes: params.regimes.regimes },
      status: "PENDING_HUMAN_APPROVAL",
      requiresHumanApproval: true,
    });

    recommendations.push({
      recommendationId: `${prefix}-scanner-weights`,
      category: "SCANNER_WEIGHTS",
      target: "scanner.scoringWeights",
      currentValue: "current_config",
      recommendedValue: scannerWeightRecommendation(params),
      rationale: "Scanner weight recommendation is advisory only and derived from strategy, confidence, and market-context evidence.",
      confidence: Math.max(35, Math.min(90, params.confidence.confidence)),
      impactEstimate: Math.max(5, params.strategies.strongStrategies.length * 8),
      evidence: {
        confidence: params.confidence,
        preferredStrategy: params.strategies.preferredStrategy,
        bestRegime: params.regimes.bestRegime,
      },
      status: "PENDING_HUMAN_APPROVAL",
      requiresHumanApproval: true,
    });

    return recommendations;
  }
}

function impactFromLossRate(lossRate: number): number {
  return Math.max(5, Math.min(50, lossRate * 50));
}

function riskRecommendation(mistakes: MistakeAnalysis): string {
  return mistakes.highRiskBehaviours.length > 0 ? "reduce_until_discipline_recovers" : "maintain";
}

function recommendedThreshold(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  return Math.max(fallback, Math.round(average(values) * 0.9));
}

function executionFriction(dataset: LearningDataset): number {
  const fillRatio = average(dataset.executionMetrics.map((metric) => metric.fillRatio));
  const delay = average(dataset.executionMetrics.map((metric) => metric.executionDelayMs));
  return Math.max(0, (1 - fillRatio) + Math.min(delay / 10_000, 1));
}

function scannerWeightRecommendation(params: {
  strategies: StrategyOptimization;
  regimes: MarketRegimeOptimization;
}) {
  return {
    increase: params.regimes.bestRegime?.avgTrend && params.regimes.bestRegime.avgTrend > 70 ? ["trend", "market_regime"] : ["confirmation"],
    decrease: params.strategies.weakStrategies.length > 0 ? ["weak_strategy_bias"] : [],
    preferStrategy: params.strategies.preferredStrategy?.strategy,
  };
}

function average(values: number[]): number {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return 0;
  return Number((finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(4));
}
