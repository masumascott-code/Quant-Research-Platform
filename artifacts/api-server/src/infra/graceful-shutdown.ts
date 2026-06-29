import type { Server } from "node:http";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { ScannerService } from "../services/scanner";
import { SlMonitor } from "../services/sl-monitor";
import { TelegramCommandBot } from "../services/telegram-command-bot";
import { queueManager } from "./queue";

export function installGracefulShutdown(server: Server): void {
  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");

    const forceTimer = setTimeout(
      () => {
        logger.error({ signal }, "Graceful shutdown timed out");
        process.exit(1);
      },
      Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 30_000),
    );
    forceTimer.unref();

    try {
      ScannerService.getInstance().stop();
      SlMonitor.getInstance().stop();
      TelegramCommandBot.getInstance().stop();
      await queueManager.close();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await pool.end();
      logger.info({ signal }, "Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err, signal }, "Graceful shutdown failed");
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
