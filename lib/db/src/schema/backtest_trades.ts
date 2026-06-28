import { pgTable, serial, text, numeric, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { backtestsTable } from "./backtests";
import { paperTradesTable } from "./paper_trades";

export const backtestTradesTable = pgTable("backtest_trades", {
  id: serial("id").primaryKey(),
  backtestId: integer("backtest_id").notNull().references(() => backtestsTable.id),
  paperTradeId: integer("paper_trade_id").references(() => paperTradesTable.id),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  entryAt: timestamp("entry_at").notNull(),
  exitAt: timestamp("exit_at"),
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 20, scale: 8 }),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  pnl: numeric("pnl", { precision: 20, scale: 8 }),
  pnlPercent: numeric("pnl_percent", { precision: 10, scale: 4 }),
  rMultiple: numeric("r_multiple", { precision: 10, scale: 4 }),
  fees: numeric("fees", { precision: 20, scale: 8 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_backtest_trades_backtest_id").on(table.backtestId),
  index("idx_backtest_trades_symbol").on(table.symbol),
  index("idx_backtest_trades_entry_at").on(table.entryAt),
]);

export const insertBacktestTradeSchema = createInsertSchema(backtestTradesTable).omit({ id: true, createdAt: true });
export type InsertBacktestTrade = z.infer<typeof insertBacktestTradeSchema>;
export type BacktestTrade = typeof backtestTradesTable.$inferSelect;
