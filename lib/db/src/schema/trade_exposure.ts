import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { paperTradesTable } from "./paper_trades";

export const tradeExposureTable = pgTable("trade_exposure", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  paperTradeId: integer("paper_trade_id").references(() => paperTradesTable.id),
  tradeId: text("trade_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  notional: numeric("notional", { precision: 20, scale: 8 }).notNull(),
  marginUsed: numeric("margin_used", { precision: 20, scale: 8 }).notNull(),
  riskAmount: numeric("risk_amount", { precision: 20, scale: 8 }).notNull(),
  exposurePercent: numeric("exposure_percent", { precision: 10, scale: 4 }).notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => [
  index("idx_trade_exposure_account_id").on(table.accountId),
  index("idx_trade_exposure_trade_id").on(table.tradeId),
  index("idx_trade_exposure_status").on(table.status),
]);

export const insertTradeExposureSchema = createInsertSchema(tradeExposureTable).omit({ id: true, createdAt: true });
export type InsertTradeExposure = z.infer<typeof insertTradeExposureSchema>;
export type TradeExposure = typeof tradeExposureTable.$inferSelect;
