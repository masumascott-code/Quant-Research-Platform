import {
  db,
  scannerDecisionsTable,
  signalExplanationsTable,
  signalScoresTable,
} from "@workspace/db";
import { desc, gte } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { configService } from "../config";
import type { ScannerDecisionResult, ScannerQualityReport, ScannerSignalGrade } from "./types";

export class ScannerDecisionRepository {
  async save(decision: ScannerDecisionResult): Promise<void> {
    try {
      await db.insert(scannerDecisionsTable).values({
        symbol: decision.context.symbol,
        direction: decision.context.direction,
        decision: decision.scoreDecision === "TRADE_ELIGIBLE"
          ? "ACCEPTED"
          : decision.scoreDecision === "WATCHLIST"
            ? "WATCHLIST"
            : "REJECTED",
        strategy: decision.strategy,
        componentScores: decision.componentScores,
        diagnosticDetails: {
          scannerMode: decision.scannerMode,
          tradeGrade: decision.tradeGrade,
          scoreDecision: decision.scoreDecision,
          scoreDecisionReason: decision.scoreDecisionReason,
          scoreBreakdown: decision.scoreBreakdown,
          shortProtection: decision.shortProtection ?? null,
        },
        rejectionStage: decision.rejectionStage,
        rejectionReason: decision.rejectionReason,
        blockedReason: decision.blockedReason,
        finalScore: String(decision.finalScore),
        technicalScore: String(decision.technicalScore),
        confidence: String(decision.confidence),
        marketRegime: decision.marketRegime,
        opportunityRank: decision.opportunityRank == null ? null : String(decision.opportunityRank),
        riskGrade: decision.context.riskGrade,
        reasons: decision.reasons,
        riskSummary: decision.riskSummary,
      });
      await db.insert(signalScoresTable).values({
        symbol: decision.context.symbol,
        direction: decision.context.direction,
        finalScore: String(decision.scoreBreakdown.finalScore),
        technicalScore: String(decision.scoreBreakdown.technicalScore),
        marketRegimeScore: String(decision.scoreBreakdown.marketRegimeScore),
        liquidityScore: String(decision.scoreBreakdown.liquidityScore),
        volumeScore: String(decision.scoreBreakdown.volumeScore),
        trendScore: String(decision.scoreBreakdown.trendScore),
        volatilityScore: String(decision.scoreBreakdown.volatilityScore),
        sessionScore: String(decision.scoreBreakdown.sessionScore),
        riskRewardScore: String(decision.scoreBreakdown.riskRewardScore),
        weights: decision.scoreBreakdown.weights,
      });
      await db.insert(signalExplanationsTable).values({
        symbol: decision.context.symbol,
        direction: decision.context.direction,
        signalGrade: decision.tradeGrade,
        whySelected: decision.explanation.whySelected,
        whyRejected: decision.scoreDecision === "REJECTED" ? decision.reasons : decision.explanation.whyRejected,
        confidenceFactors: decision.explanation.confidenceFactors,
        riskFactors: decision.explanation.riskFactors,
        marketContext: decision.explanation.marketContext,
      });
    } catch (err) {
      logger.warn({ err, symbol: decision.context.symbol }, "Failed to persist scanner decision");
    }
  }

  async dailyQualityReport(date = new Date()): Promise<ScannerQualityReport> {
    try {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const rows = await db
        .select()
        .from(scannerDecisionsTable)
        .where(gte(scannerDecisionsTable.createdAt, start))
        .orderBy(desc(scannerDecisionsTable.createdAt));

      const topRejectedReasons = this.countJsonArray(rows.flatMap((row) => Array.isArray(row.reasons) ? row.reasons as string[] : []));
      const accepted = rows.filter((row) => row.decision === "ACCEPTED");
      const rejected = rows.filter((row) => row.decision === "REJECTED");
      const strategies = this.countStrings(accepted.map((row) => row.strategy));
      const signalDistribution = rows.reduce<Record<ScannerSignalGrade, number>>((summary, row) => {
        const grade = this.gradeFromScore(Number(row.finalScore), row.decision === "REJECTED");
        summary[grade] += 1;
        return summary;
      }, { "A+": 0, A: 0, B: 0, C: 0, Rejected: 0 });
      const averageConfidence = rows.length > 0
        ? rows.reduce((sum, row) => sum + Number(row.confidence), 0) / rows.length
        : 0;
      const strategyNames = [...new Set(rows.map((row) => row.strategy))];

      return {
        totalDecisions: rows.length,
        topRejectedReasons,
        topAcceptedSetups: strategies,
        signalDistribution,
        averageConfidence,
        strategyPerformanceSummary: strategyNames.map((strategy) => ({
          strategy,
          accepted: accepted.filter((row) => row.strategy === strategy).length,
          rejected: rejected.filter((row) => row.strategy === strategy).length,
        })),
      };
    } catch (err) {
      logger.warn({ err }, "Failed to generate scanner quality report");
      return {
        totalDecisions: 0,
        topRejectedReasons: [],
        topAcceptedSetups: [],
        signalDistribution: { "A+": 0, A: 0, B: 0, C: 0, Rejected: 0 },
        averageConfidence: 0,
        strategyPerformanceSummary: [],
      };
    }
  }

  private countJsonArray(values: string[]): Array<{ reason: string; count: number }> {
    const counts = this.countStrings(values);
    return counts.map(({ strategy, count }) => ({ reason: strategy, count })).slice(0, 5);
  }

  private countStrings(values: string[]): Array<{ strategy: string; count: number }> {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([strategy, count]) => ({ strategy, count }))
      .slice(0, 5);
  }

  private gradeFromScore(score: number, rejected: boolean): ScannerSignalGrade {
    if (rejected) return "Rejected";
    if (configService.getSync().scanner.mode === "conservative_v2") {
      if (score >= 90) return "A+";
      if (score >= 85) return "A";
      if (score >= 80) return "B";
      return "C";
    }
    if (score >= 95) return "A+";
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    return "C";
  }
}
