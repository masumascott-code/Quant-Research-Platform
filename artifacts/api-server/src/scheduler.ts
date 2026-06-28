import { pool } from "@workspace/db";
import { validateProductionEnvironment } from "./infra/env";
import { scheduler } from "./infra/scheduler";
import { queueManager } from "./infra/queue";
import { logger } from "./lib/logger";

validateProductionEnvironment();

scheduler.start();
logger.info("Scheduler process started");

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Scheduler shutdown started");
  scheduler.stop();
  await queueManager.close();
  await pool.end();
  logger.info({ signal }, "Scheduler shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
