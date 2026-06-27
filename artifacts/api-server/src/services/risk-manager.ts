import { db } from "@workspace/db";
import { paperTradesTable, systemSettingsTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface RiskState {
  isPaused: boolean;
  pauseReason: string | null;
  pauseUntil: Date | null;
  consecutiveLosses: number;
  lastTradeAt: Date | null;
  cooldownUntil: Date | null;
  dailyLossPercent: number;
}

const COOLDOWN_MINUTES = 15;
const MAX_CONSECUTIVE_LOSSES = 2;
const PAUSE_AFTER_LOSSES_MINUTES = 60;
const DAILY_DRAWDOWN_LIMIT = 3.0;

class RiskManager {
  private static instance: RiskManager;

  static getInstance(): RiskManager {
    if (!RiskManager.instance) {
      RiskManager.instance = new RiskManager();
    }
    return RiskManager.instance;
  }

  private async getSetting(key: string): Promise<string | null> {
    try {
      const [row] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
      return row?.value ?? null;
    } catch {
      return null;
    }
  }

  private async setSetting(key: string, value: string): Promise<void> {
    await db.insert(systemSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value, updatedAt: new Date() } });
  }

  async getState(): Promise<RiskState> {
    const pauseUntilStr = await this.getSetting("risk_pause_until");
    const pauseReason = await this.getSetting("risk_pause_reason");
    const cooldownUntilStr = await this.getSetting("risk_cooldown_until");
    const lastTradeStr = await this.getSetting("risk_last_trade_at");

    const pauseUntil = pauseUntilStr ? new Date(pauseUntilStr) : null;
    const cooldownUntil = cooldownUntilStr ? new Date(cooldownUntilStr) : null;
    const lastTradeAt = lastTradeStr ? new Date(lastTradeStr) : null;

    const isPaused = pauseUntil !== null && pauseUntil > new Date();

    const consecutiveLosses = await this.getConsecutiveLosses();
    const dailyLossPercent = await this.getDailyLossPercent();

    return {
      isPaused,
      pauseReason: isPaused ? pauseReason : null,
      pauseUntil: isPaused ? pauseUntil : null,
      consecutiveLosses,
      lastTradeAt,
      cooldownUntil,
      dailyLossPercent,
    };
  }

  async canTrade(): Promise<{ allowed: boolean; reason: string }> {
    const state = await this.getState();

    if (state.isPaused) {
      const mins = Math.ceil((state.pauseUntil!.getTime() - Date.now()) / 60000);
      return { allowed: false, reason: `Risk pause active: ${state.pauseReason}. Resumes in ${mins}m.` };
    }

    if (state.cooldownUntil && state.cooldownUntil > new Date()) {
      const mins = Math.ceil((state.cooldownUntil.getTime() - Date.now()) / 60000);
      return { allowed: false, reason: `Cooldown active — ${mins}m remaining after last trade.` };
    }

    if (state.dailyLossPercent >= DAILY_DRAWDOWN_LIMIT) {
      await this.pause(`Daily drawdown limit ${DAILY_DRAWDOWN_LIMIT}% reached`, 24 * 60);
      return { allowed: false, reason: `Daily drawdown limit hit (${state.dailyLossPercent.toFixed(2)}%). Trading paused until tomorrow.` };
    }

    if (state.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
      await this.pause(`${MAX_CONSECUTIVE_LOSSES} consecutive losses`, PAUSE_AFTER_LOSSES_MINUTES);
      return { allowed: false, reason: `${MAX_CONSECUTIVE_LOSSES} consecutive losses — trading paused for ${PAUSE_AFTER_LOSSES_MINUTES}m.` };
    }

    return { allowed: true, reason: "OK" };
  }

  async recordTradeOpened(): Promise<void> {
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + COOLDOWN_MINUTES * 60 * 1000);
    await this.setSetting("risk_last_trade_at", now.toISOString());
    await this.setSetting("risk_cooldown_until", cooldownUntil.toISOString());
    logger.info({ cooldownUntil: cooldownUntil.toISOString() }, "Risk cooldown started");
  }

  async recordTradeClosed(result: string): Promise<void> {
    if (result === "LOSS") {
      const losses = await this.getConsecutiveLosses();
      if (losses + 1 >= MAX_CONSECUTIVE_LOSSES) {
        await this.pause(`${MAX_CONSECUTIVE_LOSSES} consecutive losses`, PAUSE_AFTER_LOSSES_MINUTES);
        logger.warn({ losses: losses + 1 }, "Max consecutive losses reached — pausing trading");
      }
    }
  }

  async pause(reason: string, durationMinutes: number): Promise<void> {
    const until = new Date(Date.now() + durationMinutes * 60 * 1000);
    await this.setSetting("risk_pause_until", until.toISOString());
    await this.setSetting("risk_pause_reason", reason);
    logger.warn({ reason, until: until.toISOString() }, "Trading paused by risk manager");
  }

  async resume(): Promise<void> {
    await this.setSetting("risk_pause_until", "");
    await this.setSetting("risk_pause_reason", "");
    logger.info("Trading resumed by risk manager");
  }

  private async getConsecutiveLosses(): Promise<number> {
    const recent = await db.select()
      .from(paperTradesTable)
      .where(eq(paperTradesTable.status, "closed"))
      .orderBy(desc(paperTradesTable.closedAt))
      .limit(5);

    let streak = 0;
    for (const t of recent) {
      if (t.result === "LOSS") streak++;
      else break;
    }
    return streak;
  }

  private async getDailyLossPercent(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const trades = await db.select()
      .from(paperTradesTable)
      .where(and(
        eq(paperTradesTable.status, "closed"),
        gte(paperTradesTable.closedAt!, today)
      ));

    const totalLoss = trades
      .filter(t => t.result === "LOSS")
      .reduce((sum, t) => sum + Math.abs(Number(t.pnlPercent ?? 0)), 0);

    return totalLoss;
  }
}

export const riskManager = RiskManager.getInstance();
