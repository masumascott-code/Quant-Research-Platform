import { pgTable, serial, text, numeric, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { signalsTable } from "./signals";

export const paperTradesTable = pgTable("paper_trades", {
  id: serial("id").primaryKey(),
  tradeId: text("trade_id").notNull().unique(),
  signalId: integer("signal_id").references(() => signalsTable.id),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  setupType: text("setup_type"),
  confidence: text("confidence"),
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  stopLoss: numeric("stop_loss", { precision: 20, scale: 8 }).notNull(),
  currentSl: numeric("current_sl", { precision: 20, scale: 8 }),
  tp1: numeric("tp1", { precision: 20, scale: 8 }).notNull(),
  tp2: numeric("tp2", { precision: 20, scale: 8 }).notNull(),
  tp3: numeric("tp3", { precision: 20, scale: 8 }).notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull().default("1"),
  signalScore: numeric("signal_score", { precision: 5, scale: 2 }).notNull(),
  signalGrade: text("signal_grade"),
  reason: text("reason").notNull(),
  slReason: text("sl_reason"),
  status: text("status").notNull().default("open"),
  result: text("result"),
  tp1Hit: boolean("tp1_hit").notNull().default(false),
  tp2Hit: boolean("tp2_hit").notNull().default(false),
  tp3Hit: boolean("tp3_hit").notNull().default(false),
  exitPrice: numeric("exit_price", { precision: 20, scale: 8 }),
  exitReason: text("exit_reason"),
  pnl: numeric("pnl", { precision: 20, scale: 8 }),
  pnlPercent: numeric("pnl_percent", { precision: 10, scale: 4 }),
  maxDrawdown: numeric("max_drawdown", { precision: 10, scale: 4 }),
  maxProfit: numeric("max_profit", { precision: 10, scale: 4 }),
  holdingDurationMinutes: integer("holding_duration_minutes"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => [
  index("idx_trades_symbol").on(table.symbol),
  index("idx_trades_status").on(table.status),
  index("idx_trades_opened_at").on(table.openedAt),
  index("idx_trades_result").on(table.result),
]);

export const insertPaperTradeSchema = createInsertSchema(paperTradesTable).omit({ id: true, openedAt: true });
export type InsertPaperTrade = z.infer<typeof insertPaperTradeSchema>;
export type PaperTrade = typeof paperTradesTable.$inferSelect;
