/**
 * SL/TP Monitor
 * Runs on the configured interval and forwards open-trade price ticks through
 * the centralized trade lifecycle service.
 */

import { logger } from "../lib/logger";
import { configService } from "../core/config";
import { tradeService } from "../core/trading";
import { PriceTracker } from "./price-tracker";

export class SlMonitor {
  private static instance: SlMonitor;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  static getInstance(): SlMonitor {
    if (!SlMonitor.instance) SlMonitor.instance = new SlMonitor();
    return SlMonitor.instance;
  }

  start() {
    if (this.running) return;
    this.running = true;
    configService.reload().catch(err => logger.error({ err }, "Failed to reload runtime config before SL monitor start"));
    logger.info("SL/TP monitor started");
    this.schedule();
  }

  stop() {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    logger.info("SL/TP monitor stopped");
  }

  private schedule() {
    this.timer = setTimeout(async () => {
      if (!this.running) return;
      await this.check();
      this.schedule();
    }, configService.getSync().slMonitor.checkIntervalMs);
  }

  private async check() {
    try {
      const openTrades = await tradeService.getOpenTrades();
      if (openTrades.length === 0) return;

      const prices = PriceTracker.getInstance().getLatestPrices();

      for (const trade of openTrades) {
        const priceData = prices[trade.symbol.toUpperCase()];
        if (!priceData) {
          logger.warn({ symbol: trade.symbol }, "No mark price available for trade - skipping");
          continue;
        }

        await tradeService.processPriceTick(trade, priceData.price);
      }
    } catch (err) {
      logger.error({ err }, "SL monitor check failed");
    }
  }
}
