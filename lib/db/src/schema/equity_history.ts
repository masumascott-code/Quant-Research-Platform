import { pgTable, serial, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";

export const equityHistoryTable = pgTable("equity_history", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  equity: numeric("equity", { precision: 20, scale: 8 }).notNull(),
  availableBalance: numeric("available_balance", { precision: 20, scale: 8 }).notNull(),
  usedMargin: numeric("used_margin", { precision: 20, scale: 8 }).notNull(),
  freeMargin: numeric("free_margin", { precision: 20, scale: 8 }).notNull(),
  dailyPnl: numeric("daily_pnl", { precision: 20, scale: 8 }).notNull().default("0"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
}, (table) => [
  index("idx_equity_history_account_id").on(table.accountId),
  index("idx_equity_history_recorded_at").on(table.recordedAt),
]);

export const insertEquityHistorySchema = createInsertSchema(equityHistoryTable).omit({ id: true, recordedAt: true });
export type InsertEquityHistory = z.infer<typeof insertEquityHistorySchema>;
export type EquityHistory = typeof equityHistoryTable.$inferSelect;
