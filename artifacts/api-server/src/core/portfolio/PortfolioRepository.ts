import {
  accountsTable,
  db,
  equityHistoryTable,
  paperTradesTable,
  portfolioPositionsTable,
  portfolioTable,
  tradeExposureTable,
} from "@workspace/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { logger } from "../../lib/logger";
import type { PaperTradeRecord } from "../trading";
import type { AccountSnapshot, PortfolioSummary } from "./types";
import type { PositionSizingPlan } from "./PositionSizingService";

const PAPER_ACCOUNT_KEY = "paper-default";

export class PortfolioRepository {
  async getOpenTrades(): Promise<PaperTradeRecord[]> {
    return await db.select().from(paperTradesTable).where(eq(paperTradesTable.status, "open"));
  }

  async getClosedTrades(): Promise<PaperTradeRecord[]> {
    return await db.select().from(paperTradesTable).where(eq(paperTradesTable.status, "closed"));
  }

  async getTodayClosedTrades(): Promise<PaperTradeRecord[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return await db
      .select()
      .from(paperTradesTable)
      .where(and(eq(paperTradesTable.status, "closed"), gte(paperTradesTable.closedAt!, today)));
  }

  async ensurePaperAccount(snapshot: AccountSnapshot): Promise<number | null> {
    try {
      const [existing] = await db
        .select()
        .from(accountsTable)
        .where(eq(accountsTable.accountKey, PAPER_ACCOUNT_KEY))
        .limit(1);
      if (existing) {
        await db.update(accountsTable).set({
          equity: String(snapshot.equity),
          availableBalance: String(snapshot.availableBalance),
          usedMargin: String(snapshot.usedMargin),
          leverage: String(snapshot.leverage),
          updatedAt: new Date(),
        }).where(eq(accountsTable.id, existing.id));
        return existing.id;
      }

      const [created] = await db.insert(accountsTable).values({
        accountKey: PAPER_ACCOUNT_KEY,
        name: "Paper Trading Account",
        accountType: snapshot.accountType,
        currency: snapshot.currency,
        equity: String(snapshot.equity),
        availableBalance: String(snapshot.availableBalance),
        usedMargin: String(snapshot.usedMargin),
        leverage: String(snapshot.leverage),
        isActive: true,
      }).returning();
      return created?.id ?? null;
    } catch (err) {
      logger.warn({ err }, "Portfolio account table unavailable; using computed account snapshot only");
      return null;
    }
  }

  async recordEquitySnapshot(accountId: number | null, snapshot: AccountSnapshot, dailyPnl: number): Promise<void> {
    if (!accountId) return;
    try {
      await db.insert(equityHistoryTable).values({
        accountId,
        equity: String(snapshot.equity),
        availableBalance: String(snapshot.availableBalance),
        usedMargin: String(snapshot.usedMargin),
        freeMargin: String(snapshot.freeMargin),
        dailyPnl: String(dailyPnl),
      });
    } catch (err) {
      logger.warn({ err }, "Failed to record equity history");
    }
  }

  async recordPortfolioSnapshot(accountId: number | null, summary: PortfolioSummary): Promise<void> {
    if (!accountId) return;
    try {
      await db.insert(portfolioTable).values({
        accountId,
        name: "Default Portfolio",
        currency: summary.currency,
        totalEquity: String(summary.equity),
        usedEquity: String(summary.usedMargin),
        freeEquity: String(summary.freeMargin),
        openExposure: String(summary.openExposure),
        dailyPnl: String(summary.dailyPnl),
        riskUsagePercent: String(summary.riskUsagePercent),
      });
    } catch (err) {
      logger.warn({ err }, "Failed to record portfolio snapshot");
    }
  }

  async recordTradeOpened(accountId: number | null, trade: PaperTradeRecord, plan: PositionSizingPlan): Promise<void> {
    if (!accountId) return;
    try {
      await db.insert(tradeExposureTable).values({
        accountId,
        paperTradeId: trade.id,
        tradeId: trade.tradeId,
        symbol: trade.symbol,
        direction: trade.direction,
        notional: String(plan.notional),
        marginUsed: String(plan.marginUsed),
        riskAmount: String(plan.riskAmount),
        exposurePercent: "0",
        status: "open",
      });
      await db.insert(portfolioPositionsTable).values({
        accountId,
        paperTradeId: trade.id,
        tradeId: trade.tradeId,
        symbol: trade.symbol,
        direction: trade.direction,
        assetClass: "crypto",
        sector: "crypto",
        quantity: String(plan.quantity),
        entryPrice: String(trade.entryPrice),
        notional: String(plan.notional),
        marginUsed: String(plan.marginUsed),
        riskAmount: String(plan.riskAmount),
        status: "open",
      });
    } catch (err) {
      logger.warn({ err, tradeId: trade.tradeId }, "Failed to record trade exposure");
    }
  }

  async recordTradeClosed(trade: PaperTradeRecord): Promise<void> {
    try {
      await db.update(tradeExposureTable).set({
        status: "closed",
        closedAt: trade.closedAt ?? new Date(),
      }).where(eq(tradeExposureTable.tradeId, trade.tradeId));
      await db.update(portfolioPositionsTable).set({
        status: "closed",
        closedAt: trade.closedAt ?? new Date(),
      }).where(eq(portfolioPositionsTable.tradeId, trade.tradeId));
    } catch (err) {
      logger.warn({ err, tradeId: trade.tradeId }, "Failed to close trade exposure");
    }
  }
}
