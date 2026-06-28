import { db, signalsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { marketIntelligenceService, type MarketContext } from "../market";
import { portfolioService } from "../portfolio";
import { ConfluenceEngine } from "./ConfluenceEngine";
import { MarketFilter } from "./MarketFilter";
import { ScannerDecisionRepository } from "./ScannerDecisionRepository";
import { SignalQualityEngine } from "./SignalQualityEngine";
import { StrategySelector } from "./StrategySelector";
import type { ScannerCandidateInput, ScannerDecisionResult, ScannerExplanation } from "./types";

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
    const signalGrade = this.signalQualityEngine.classify(scoreBreakdown.finalScore, !filter.accepted);
    const explanation = this.explain(candidate, context, filter.rejectedReasons);

    const decision: ScannerDecisionResult = {
      accepted: filter.accepted,
      finalScore: scoreBreakdown.finalScore,
      signalGrade,
      strategy,
      marketRegime: context.marketRegime.regime,
      confidence: context.confidence,
      opportunityRank: context.opportunityRank,
      reasons: filter.accepted ? explanation.whySelected : filter.rejectedReasons,
      riskSummary: filter.riskSummary,
      context,
      scoreBreakdown,
      explanation,
    };

    await this.repository.save(decision);
    return decision;
  }

  async dailyQualityReport() {
    return this.repository.dailyQualityReport();
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
