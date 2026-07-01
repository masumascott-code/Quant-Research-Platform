import { Worker } from "bullmq";
import { pool } from "@workspace/db";
import { positiveIntegerEnv, validateProductionEnvironment } from "./infra/env";
import { jobHandlers } from "./infra/jobs";
import { queueJobDuration, queueJobsTotal } from "./infra/metrics";
import { queueManager } from "./infra/queue";
import { logger } from "./lib/logger";

validateProductionEnvironment();

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const workerConcurrency = positiveIntegerEnv(
  "WORKER_CONCURRENCY",
  2,
  "positive integer worker concurrency",
);
const queues = (process.env.WORKER_QUEUES ?? "reports,maintenance,scanner")
  .split(",")
  .map((queue) => queue.trim())
  .filter(Boolean);

const workers = queues.map(
  (queueName) =>
    new Worker(
      queueName,
      async (job) => {
        const startedAt = process.hrtime.bigint();
        const handler = jobHandlers[job.name];
        if (!handler)
          throw new Error(`No handler registered for job ${job.name}`);

        try {
          await handler(job.data ?? {});
          queueJobsTotal.inc({
            queue: queueName,
            job: job.name,
            status: "completed",
          });
        } catch (err) {
          queueJobsTotal.inc({
            queue: queueName,
            job: job.name,
            status: "failed",
          });
          throw err;
        } finally {
          const durationSeconds =
            Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
          queueJobDuration.observe(
            { queue: queueName, job: job.name },
            durationSeconds,
          );
        }
      },
      {
        connection: { url: redisUrl },
        concurrency: workerConcurrency,
      },
    ),
);

for (const worker of workers) {
  worker.on("ready", () => logger.info({ queue: worker.name }, "Worker ready"));
  worker.on("failed", (job, err) => {
    logger.error(
      { queue: worker.name, jobId: job?.id, err },
      "Worker job failed",
    );
    const attempts = Number(job?.opts.attempts ?? 1);
    if (job && job.attemptsMade >= attempts) {
      queueManager
        .add({
          queue: "dead-letter",
          name: "dead-letter",
          payload: {
            sourceQueue: worker.name,
            sourceJob: job.name,
            sourceJobId: job.id,
            failedReason: err.message,
            data: job.data,
          },
        })
        .catch((dlqErr) =>
          logger.error(
            { err: dlqErr, jobId: job.id },
            "Failed to publish dead-letter job",
          ),
        );
    }
  });
  worker.on("error", (err) => logger.error({ err }, "Worker error"));
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Worker shutdown started");
  await Promise.all(workers.map((worker) => worker.close()));
  await pool.end();
  logger.info({ signal }, "Worker shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
