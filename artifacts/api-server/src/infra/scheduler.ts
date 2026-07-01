import { logger } from "../lib/logger";
import { boolEnv, positiveIntegerEnv } from "./env";
import { queueManager, type QueueJobDefinition } from "./queue";

interface ScheduledJob {
  name: string;
  intervalMs: number;
  job: QueueJobDefinition;
  timer?: NodeJS.Timeout;
}

export class Scheduler {
  private readonly enabled = boolEnv("SCHEDULER_ENABLED", true);
  private jobs: ScheduledJob[] = [
    {
      name: "daily-report",
      intervalMs: positiveIntegerEnv(
        "SCHEDULE_DAILY_REPORT_MS",
        86_400_000,
        "positive integer milliseconds",
      ),
      job: {
        queue: "reports",
        name: "daily-report",
        options: { jobId: "daily-report" },
      },
    },
    {
      name: "weekly-report",
      intervalMs: positiveIntegerEnv(
        "SCHEDULE_WEEKLY_REPORT_MS",
        604_800_000,
        "positive integer milliseconds",
      ),
      job: {
        queue: "reports",
        name: "weekly-report",
        options: { jobId: "weekly-report" },
      },
    },
    {
      name: "adaptive-learning",
      intervalMs: positiveIntegerEnv(
        "SCHEDULE_ADAPTIVE_LEARNING_MS",
        86_400_000,
        "positive integer milliseconds",
      ),
      job: {
        queue: "reports",
        name: "adaptive-learning",
        options: { jobId: "adaptive-learning" },
      },
    },
    {
      name: "scanner-cleanup",
      intervalMs: positiveIntegerEnv(
        "SCHEDULE_SCANNER_CLEANUP_MS",
        86_400_000,
        "positive integer milliseconds",
      ),
      job: {
        queue: "maintenance",
        name: "scanner-cleanup",
        options: { jobId: "scanner-cleanup" },
      },
    },
    {
      name: "market-snapshot-cleanup",
      intervalMs: positiveIntegerEnv(
        "SCHEDULE_MARKET_SNAPSHOT_CLEANUP_MS",
        86_400_000,
        "positive integer milliseconds",
      ),
      job: {
        queue: "maintenance",
        name: "market-snapshot-cleanup",
        options: { jobId: "market-snapshot-cleanup" },
      },
    },
    {
      name: "database-cleanup",
      intervalMs: positiveIntegerEnv(
        "SCHEDULE_DATABASE_CLEANUP_MS",
        86_400_000,
        "positive integer milliseconds",
      ),
      job: {
        queue: "maintenance",
        name: "database-cleanup",
        options: { jobId: "database-cleanup" },
      },
    },
  ];

  start(): void {
    if (!this.enabled) {
      logger.warn("Scheduler disabled by SCHEDULER_ENABLED=false");
      return;
    }

    for (const scheduled of this.jobs) {
      scheduled.timer = setInterval(() => {
        queueManager.add(scheduled.job).catch((err) => {
          logger.error(
            { err, job: scheduled.name },
            "Failed to enqueue scheduled job",
          );
        });
      }, scheduled.intervalMs);

      if (process.env.SCHEDULER_ENQUEUE_ON_START === "true") {
        queueManager.add(scheduled.job).catch((err) => {
          logger.error(
            { err, job: scheduled.name },
            "Failed to enqueue startup job",
          );
        });
      }
      logger.info(
        { job: scheduled.name, intervalMs: scheduled.intervalMs },
        "Scheduled job registered",
      );
    }
  }

  stop(): void {
    for (const scheduled of this.jobs) {
      if (scheduled.timer) clearInterval(scheduled.timer);
      scheduled.timer = undefined;
    }
  }
}

export const scheduler = new Scheduler();
