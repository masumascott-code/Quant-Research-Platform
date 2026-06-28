import { pgTable, serial, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fundingHistoryTable = pgTable("funding_history", {
  id: serial("id").primaryKey(),
  tradeId: text("trade_id").notNull(),
  symbol: text("symbol").notNull(),
  notional: numeric("notional", { precision: 20, scale: 8 }).notNull(),
  fundingRate: numeric("funding_rate", { precision: 12, scale: 8 }).notNull(),
  fundingFee: numeric("funding_fee", { precision: 20, scale: 8 }).notNull(),
  intervalHours: numeric("interval_hours", { precision: 10, scale: 4 }).notNull(),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
}, (table) => [
  index("idx_funding_history_trade_id").on(table.tradeId),
  index("idx_funding_history_symbol").on(table.symbol),
]);

export const insertFundingHistorySchema = createInsertSchema(fundingHistoryTable).omit({ id: true, appliedAt: true });
export type InsertFundingHistory = z.infer<typeof insertFundingHistorySchema>;
export type FundingHistory = typeof fundingHistoryTable.$inferSelect;
