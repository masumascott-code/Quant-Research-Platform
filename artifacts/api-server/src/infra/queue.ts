import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import { logger } from "../lib/logger";
import { boolEnv, nonNegativeIntegerEnv, positiveIntegerEnv } from "./env";

export type QueueName = "reports" | "maintenance" | "scanner" | "dead-letter";

export interface QueueJobPayload {
  [key: string]: unknown;
}

export interface QueueJobDefinition {
  queue: QueueName;
  name: string;
  payload?: QueueJobPayload;
  options?: JobsOptions;
}

class QueueManager {
  private queues = new Map<QueueName, Queue>();
  private queueEvents = new Map<QueueName, QueueEvents>();
  private readonly enabled = boolEnv("QUEUE_ENABLED", true);
  private readonly redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  private readonly jobAttempts = positiveIntegerEnv(
    "QUEUE_JOB_ATTEMPTS",
    3,
    "positive integer attempt count",
  );
  private readonly jobBackoffMs = nonNegativeIntegerEnv(
    "QUEUE_JOB_BACKOFF_MS",
    5_000,
    "non-negative integer milliseconds",
  );
  private readonly removeCompleteAgeSeconds = nonNegativeIntegerEnv(
    "QUEUE_REMOVE_COMPLETE_AGE_SECONDS",
    86_400,
    "non-negative integer seconds",
  );
  private readonly removeCompleteCount = nonNegativeIntegerEnv(
    "QUEUE_REMOVE_COMPLETE_COUNT",
    1_000,
    "non-negative integer count",
  );

  getQueue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, {
      connection: { url: this.redisUrl },
      defaultJobOptions: {
        attempts: this.jobAttempts,
        backoff: {
          type: "exponential",
          delay: this.jobBackoffMs,
        },
        removeOnComplete: {
          age: this.removeCompleteAgeSeconds,
          count: this.removeCompleteCount,
        },
        removeOnFail: false,
      },
    });

    const events = new QueueEvents(name, {
      connection: { url: this.redisUrl },
    });
    events.on("failed", ({ jobId, failedReason }) => {
      logger.error({ queue: name, jobId, failedReason }, "Queue job failed");
    });
    events.on("completed", ({ jobId }) => {
      logger.info({ queue: name, jobId }, "Queue job completed");
    });

    this.queues.set(name, queue);
    this.queueEvents.set(name, events);
    return queue;
  }

  async add(job: QueueJobDefinition): Promise<void> {
    if (!this.enabled) {
      logger.warn({ job }, "Queue is disabled; job was not enqueued");
      return;
    }

    await this.getQueue(job.queue).add(job.name, job.payload ?? {}, {
      ...job.options,
      jobId: job.options?.jobId,
    });
  }

  async close(): Promise<void> {
    await Promise.all([
      ...[...this.queueEvents.values()].map((events) => events.close()),
      ...[...this.queues.values()].map((queue) => queue.close()),
    ]);
    this.queueEvents.clear();
    this.queues.clear();
  }
}

export const queueManager = new QueueManager();
