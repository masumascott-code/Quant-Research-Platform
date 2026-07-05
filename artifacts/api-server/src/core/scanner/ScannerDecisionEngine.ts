import { db, signalsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { configService } from "../config";
import { marketIntelligenceService, type MarketContext } from "../market";
import { portfolioService } from "../portfolio";
import { ConfluenceEngine } from "./ConfluenceEngine";
import { MarketFilter } from "./MarketFilter";
import { ScannerDecisionRepository } from "./ScannerDecisionRepository";
import { SignalQualityEngine } from "./SignalQualityEngine";
import { StrategySelector } from "./StrategySelector";
import type {
  ScannerCandidateInput,
  ScannerComponentScores,
  ScannerDecisionResult,
  ScannerExplanation,
  ScannerScoreDecision,
  ShortProtectionDiagnostic,
} from "./types";

export class ScannerDecisionEngine {
  constructor(
    private readonly confluenceEngine = new ConfluenceEngine(),
    private readonly strategySelector = new StrategySelector(),
    private readonly signalQualityEngine = new SignalQualityEngine(),
    private readonly marketFilter = new MarketFilter(),
    private readonly repository = new ScannerDecisionRepository()
  ) {}

  async decide(candidate: ScannerCandidateInput): Promise<ScannerDecisionResult> {
    const rankings = await marketIntelligenceService.rankCandidates([{
      symbol: candidate.symbol,
      direction: candidate.direction,
      candles: candidate.candles,
      signalScore: candidate.technicalSignal.score,
      rrRatio: candidate.technicalSignal.rrRatio,
    }]);
    const context = rankings.all[0];
    const scoreBreakdown = this.confluenceEngine.calculate(candidate.technicalSignal, context);
    const strategy = this.strategySelector.select(context.marketRegime.regime);
    const [duplicateActiveSignal, portfolioApproval] = await Promise.all([
      this.hasDuplicateActiveSignal(candidate.symbol),
      portfolioService.validateTrade(
        { id: 0, symbol: candidate.symbol, direction: candidate.direction },
        { ...candidate.technicalSignal, grade: candidate.technicalSignal.grade ?? undefined }
      ).catch((err) => {
        logger.warn({ err, symbol: candidate.symbol }, "Portfolio filter failed during scanner decision");
        return { approved: true, reason: null };
      }),
    ]);
    const filter = this.marketFilter.evaluate({
      context,
      duplicateActiveSignal,
      portfolioAllowed: Boolean(portfolioApproval.approved),
      portfolioReason: portfolioApproval.reason,
    });
    const explanation = this.explain(candidate, context, filter.rejectedReasons);
    const shortProtection = this.withMarketRegime(candidate.shortProtection, context.marketRegime.regime);
    const scoreDecision = this.scoreDecision(candidate, scoreBreakdown.finalScore, filter.accepted);
    const accepted = filter.accepted && scoreDecision.scoreDecision !== "REJECTED";
    const signalGrade = this.signalQualityEngine.classify(scoreBreakdown.finalScore, !accepted);
    const tradeGrade = this.signalQualityEngine.tradeGrade(scoreBreakdown.finalScore);
    const rejectionReason = !filter.accepted
      ? filter.rejectedReasons[0] ?? "Market filter rejected signal"
      : scoreDecision.scoreDecision === "REJECTED"
        ? scoreDecision.scoreDecisionReason
        : null;
    const reasons = !filter.accepted
      ? filter.rejectedReasons
      : scoreDecision.scoreDecision === "REJECTED"
        ? [scoreDecision.scoreDecisionReason]
        : [...explanation.whySelected, scoreDecision.scoreDecisionReason];

    const decision: ScannerDecisionResult = {
      accepted,
      scannerMode: configService.getSync().scanner.mode,
      finalScore: scoreBreakdown.finalScore,
      technicalScore: scoreBreakdown.technicalScore,
      signalGrade,
      tradeGrade,
      scoreDecision: scoreDecision.scoreDecision,
      scoreDecisionReason: scoreDecision.scoreDecisionReason,
      strategy,
      marketRegime: context.marketRegime.regime,
      confidence: context.confidence,
      opportunityRank: context.opportunityRank,
      reasons,
      riskSummary: filter.riskSummary,
      context,
      scoreBreakdown,
      componentScores: this.componentScores(candidate, scoreBreakdown),
      rejectionStage: rejectionReason ? (filter.accepted ? "Score Gate" : "Market Filter") : null,
      rejectionReason,
      blockedReason: rejectionReason,
      shortProtection,
      explanation,
    };

    await this.repository.save(decision);
    return decision;
  }

  async dailyQualityReport() {
    return this.repository.dailyQualityReport();
  }

  private componentScores(candidate: ScannerCandidateInput, scoreBreakdown: ScannerDecisionResult["scoreBreakdown"]): ScannerComponentScores {
    return {
      trendScore: candidate.technicalSignal.trendScore,
      emaAlignmentScore: candidate.technicalSignal.emaScore,
      volumeScore: candidate.technicalSignal.volumeScore,
      rvolScore: candidate.technicalSignal.rvolScore,
      breakoutScore: candidate.technicalSignal.breakoutScore,
      retestScore: candidate.technicalSignal.retestScore,
      structureScore: candidate.technicalSignal.structureScore,
      momentumScore: candidate.technicalSignal.momentumScore,
      marketRegimeScore: scoreBreakdown.marketRegimeScore,
      liquidityScore: scoreBreakdown.liquidityScore,
      volatilityScore: scoreBreakdown.volatilityScore,
      sessionScore: scoreBreakdown.sessionScore,
      riskRewardScore: scoreBreakdown.riskRewardScore,
    };
  }

  private withMarketRegime(shortProtection: ShortProtectionDiagnostic | undefined, marketRegime: string): ShortProtectionDiagnostic | undefined {
    if (!shortProtection) return undefined;
    const config = configService.getSync().shortProtection;
    const reasons = [...shortProtection.shortProtectionReasons];

    if (config.requireBearishMarketForShorts && marketRegime !== "TRENDING_BEAR") {
      reasons.push(`Market regime is not bearish (${marketRegime})`);
    }
    if (config.blockShortsInBullishRegime && marketRegime === "TRENDING_BULL") {
      reasons.push("Market regime is bullish");
    }

    return {
      ...shortProtection,
      marketRegime,
      shortProtectionReasons: [...new Set(reasons)],
      shortProtectionWouldBlock: config.enabled && reasons.length > 0,
      diagnosticOnly: config.diagnosticOnly,
    };
  }

  private scoreDecision(
    candidate: ScannerCandidateInput,
    finalScore: number,
    marketFilterAccepted: boolean,
  ): { scoreDecision: ScannerScoreDecision; scoreDecisionReason: string } {
    const config = configService.getSync().scanner;
    if (!marketFilterAccepted) {
      return {
        scoreDecision: "REJECTED",
        scoreDecisionReason: "Rejected by market or portfolio filter before score gate",
      };
    }

    if (finalScore < config.minScoreWatchlist) {
      return {
        scoreDecision: "REJECTED",
        scoreDecisionReason: `Final score ${finalScore.toFixed(2)} is below watchlist threshold ${config.minScoreWatchlist}`,
      };
    }

    const hasRetest = (candidate.technicalSignal.retestScore ?? 0) > 0;
    if (
      config.mode === "conservative_v2"
      && config.requireRetestForTrade
      && !hasRetest
      && finalScore >= config.minScoreTrade
    ) {
      return config.allowBreakoutWithoutRetestToWatchlist
        ? {
          scoreDecision: "WATCHLIST",
          scoreDecisionReason: "Conservative mode requires a retest before trade; breakout remains watchlist eligible",
        }
        : {
          scoreDecision: "REJECTED",
          scoreDecisionReason: "Conservative mode rejected breakout without required retest",
        };
    }

    if (finalScore >= config.minScoreTrade) {
      return {
        scoreDecision: "TRADE_ELIGIBLE",
        scoreDecisionReason: `Final score ${finalScore.toFixed(2)} meets trade threshold ${config.minScoreTrade}`,
      };
    }

    return {
      scoreDecision: "WATCHLIST",
      scoreDecisionReason: `Final score ${finalScore.toFixed(2)} is watchlist only below trade threshold ${config.minScoreTrade}`,
    };
  }

  private async hasDuplicateActiveSignal(symbol: string): Promise<boolean> {
    const existingSignal = await db.select({ id: signalsTable.id }).from(signalsTable)
      .where(and(eq(signalsTable.symbol, symbol), eq(signalsTable.status, "active")))
      .limit(1);
    return existingSignal.length > 0;
  }

  private explain(candidate: ScannerCandidateInput, context: MarketContext, rejectedReasons: string[]): ScannerExplanation {
    return {
      whySelected: [
        `Technical score ${candidate.technicalSignal.score.toFixed(2)} with ${candidate.technicalSignal.setupType ?? "setup"} context`,
        `Market regime ${context.marketRegime.regime} confidence ${context.marketRegime.confidence.toFixed(2)}`,
        `Session ${context.session.session} quality ${context.session.qualityScore.toFixed(2)}`,
      ],
      whyRejected: rejectedReasons,
      confidenceFactors: [
        `Final confidence ${context.confidence.toFixed(2)}`,
        `Trend score ${context.trendScore.toFixed(2)}`,
        `Volume score ${context.volumeScore.toFixed(2)}`,
        `Liquidity score ${context.liquidityScore.toFixed(2)}`,
      ],
      riskFactors: [
        `Risk grade ${context.riskGrade}`,
        `Volatility score ${context.volatilityScore.toFixed(2)}`,
        `Risk/reward ${candidate.technicalSignal.rrRatio.toFixed(2)}`,
      ],
      marketContext: {
        regime: context.marketRegime.regime,
        session: context.session.session,
        confidence: context.confidence,
        opportunityRank: context.opportunityRank,
      },
    };
  }
}

export const scannerDecisionEngine = new ScannerDecisionEngine();
