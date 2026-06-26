/**
 * SL/TP Monitor
 * Runs every 30 seconds and checks all open trades against current mark prices.
 *
 * Rules:
 *   - SL hit     → auto-close as LOSS, send Telegram, trigger learning engine
 *   - TP1 hit    → mark tp1Hit=true, move SL to breakeven (entry price)
 *   - TP2 hit    → mark tp2Hit=true, move SL to TP1 (lock in partial profit)
 *   - TP3 hit    → auto-close as WIN, send Telegram, trigger learning engine
 */

import { db } from "@workspace/db";
import { paperTradesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { PriceTracker } from "./price-tracker";
import { Telegram } from "./telegram";
import { reviewClosedTrade } from "./learning-engine";

const CHECK_INTERVAL_MS = 30_000;

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
    }, CHECK_INTERVAL_MS);
  }

  private async check() {
    try {
      const openTrades = await db
        .select()
        .from(paperTradesTable)
        .where(eq(paperTradesTable.status, "open"));

      if (openTrades.length === 0) return;

      const prices = PriceTracker.getInstance().getLatestPrices();

      for (const trade of openTrades) {
        const priceData = prices[trade.symbol.toUpperCase()];
        if (!priceData) {
          logger.warn({ symbol: trade.symbol }, "No mark price available for trade — skipping");
          continue;
        }

        const markPrice = priceData.price;
        const entry = Number(trade.entryPrice);
        const sl = Number(trade.currentSl ?? trade.stopLoss);
        const tp1 = Number(trade.tp1);
        const tp2 = Number(trade.tp2);
        const tp3 = Number(trade.tp3);
        const isLong = trade.direction === "LONG";

        // ── SL Hit ───────────────────────────────────────────────────────────
        const slHit = isLong ? markPrice <= sl : markPrice >= sl;
        if (slHit) {
          logger.info({ tradeId: trade.tradeId, symbol: trade.symbol, markPrice, sl }, "SL hit — auto-closing");
          const closed = await this.closeTrade(trade, markPrice, "Auto: Stop-loss hit", "LOSS");
          await Telegram.slHit(trade.tradeId, trade.symbol, markPrice).catch(() => {});
          await Telegram.tradeClosed({
            tradeId: trade.tradeId,
            symbol: trade.symbol,
            direction: trade.direction,
            entryPrice: entry,
            exitPrice: markPrice,
            pnl: closed.pnl,
            pnlPercent: closed.pnlPercent,
            result: "LOSS",
            exitReason: "Stop-loss hit (auto-close)",
            holdingDurationMinutes: closed.holdingDurationMinutes,
          }).catch(() => {});
          await reviewClosedTrade(trade.id).catch(() => {});
          continue; // no need to check TPs for a closed trade
        }

        // ── TP3 Hit ──────────────────────────────────────────────────────────
        const tp3Hit = !trade.tp3Hit && (isLong ? markPrice >= tp3 : markPrice <= tp3);
        if (tp3Hit) {
          logger.info({ tradeId: trade.tradeId, symbol: trade.symbol, markPrice, tp3 }, "TP3 hit — auto-closing WIN");
          const closed = await this.closeTrade(trade, markPrice, "Auto: TP3 target reached", "WIN");
          await Telegram.tp3Hit(trade.tradeId, trade.symbol, markPrice).catch(() => {});
          await Telegram.tradeClosed({
            tradeId: trade.tradeId,
            symbol: trade.symbol,
            direction: trade.direction,
            entryPrice: entry,
            exitPrice: markPrice,
            pnl: closed.pnl,
            pnlPercent: closed.pnlPercent,
            result: "WIN",
            exitReason: "TP3 target reached (auto-close)",
            holdingDurationMinutes: closed.holdingDurationMinutes,
          }).catch(() => {});
          await reviewClosedTrade(trade.id).catch(() => {});
          continue;
        }

        // ── TP2 Hit ──────────────────────────────────────────────────────────
        const tp2Newly = !trade.tp2Hit && (isLong ? markPrice >= tp2 : markPrice <= tp2);
        if (tp2Newly) {
          // Trail SL to TP1 (lock in partial profit)
          const newSl = String(tp1);
          await db
            .update(paperTradesTable)
            .set({ tp2Hit: true, currentSl: newSl })
            .where(eq(paperTradesTable.id, trade.id));
          logger.info({ tradeId: trade.tradeId, symbol: trade.symbol, newSl }, "TP2 hit — SL trailed to TP1");
          await Telegram.tp2Hit(trade.tradeId, trade.symbol, markPrice).catch(() => {});
        }

        // ── TP1 Hit ──────────────────────────────────────────────────────────
        const tp1Newly = !trade.tp1Hit && (isLong ? markPrice >= tp1 : markPrice <= tp1);
        if (tp1Newly && !tp2Newly) {
          // Move SL to breakeven (entry price)
          const newSl = String(entry);
          await db
            .update(paperTradesTable)
            .set({ tp1Hit: true, currentSl: newSl })
            .where(eq(paperTradesTable.id, trade.id));
          logger.info({ tradeId: trade.tradeId, symbol: trade.symbol, newSl }, "TP1 hit — SL moved to breakeven");
          await Telegram.tp1Hit(trade.tradeId, trade.symbol, markPrice).catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err }, "SL monitor check failed");
    }
  }

  private async closeTrade(
    trade: typeof paperTradesTable.$inferSelect,
    exitPrice: number,
    exitReason: string,
    forceResult?: string
  ): Promise<{ pnl: number; pnlPercent: number; holdingDurationMinutes: number }> {
    const entry = Number(trade.entryPrice);
    const qty = Number(trade.quantity);
    const isLong = trade.direction === "LONG";

    const pnl = isLong
      ? (exitPrice - entry) * qty
      : (entry - exitPrice) * qty;

    const pnlPercent = (pnl / (entry * qty)) * 100;

    let result: string;
    if (forceResult) {
      result = forceResult;
    } else if (Math.abs(pnl) < 0.001) {
      result = "BREAKEVEN";
    } else {
      result = pnl > 0 ? "WIN" : "LOSS";
    }

    const now = new Date();
    const holdingDurationMinutes = Math.round(
      (now.getTime() - new Date(trade.openedAt).getTime()) / 60_000
    );

    await db
      .update(paperTradesTable)
      .set({
        status: "closed",
        result,
        exitPrice: String(exitPrice),
        exitReason,
        pnl: String(pnl),
        pnlPercent: String(pnlPercent),
        holdingDurationMinutes,
        closedAt: now,
      })
      .where(eq(paperTradesTable.id, trade.id));

    logger.info({ tradeId: trade.tradeId, result, pnl: pnl.toFixed(4) }, "Trade auto-closed");
    return { pnl, pnlPercent, holdingDurationMinutes };
  }
}
