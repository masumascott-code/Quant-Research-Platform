import { db, marketSnapshotsTable } from "@workspace/db";
import { lt, sql } from "drizzle-orm";
import { aiReportService } from "../core/ai";
import { adaptiveLearningEngine } from "../core/learning";
import { logger } from "../lib/logger";

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

export const jobHandlers: Record<string, JobHandler> = {
  "daily-report": async () => {
    const report = await aiReportService.dailyReport();
    logger.info({ summary: report.summary }, "Daily AI report generated");
  },
  "weekly-report": async () => {
    const report = await aiReportService.weeklyReport();
    logger.info({ summary: report.summary }, "Weekly AI report generated");
  },
  "adaptive-learning": async () => {
    const result = await adaptiveLearningEngine.run({
      lookbackDays: 30,
      persist: true,
    });
    logger.info(
      {
        runId: result.runId,
        recommendations: result.recommendations.length,
        edgeScore: result.scores.edgeScore,
      },
      "Adaptive learning run completed",
    );
  },
  "scanner-cleanup": async () => {
    logger.info("Scanner cleanup completed");
  },
  "market-snapshot-cleanup": async (payload) => {
    const retentionDays = numberPayload(
      payload.retentionDays,
      Number(process.env.MARKET_SNAPSHOT_RETENTION_DAYS ?? 30),
    );
    const cutoff = olderThan(retentionDays);
    const result = await db
      .delete(marketSnapshotsTable)
      .where(lt(marketSnapshotsTable.scannedAt, cutoff));
    logger.info({ retentionDays, result }, "Market snapshot cleanup completed");
  },
  "database-cleanup": async (payload) => {
    const retentionDays = numberPayload(
      payload.learningHistoryRetentionDays,
      Number(process.env.LEARNING_HISTORY_RETENTION_DAYS ?? 365),
    );
    const cutoff = olderThan(retentionDays);
    await db.execute(sql`
      DELETE FROM learning_history
      WHERE created_at < ${cutoff.toISOString()}::timestamp
        AND event_type = 'RECOMMENDATION_CREATED'
    `);
    logger.info({ retentionDays }, "Database cleanup completed");
  },
};

function olderThan(days: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

function numberPayload(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
