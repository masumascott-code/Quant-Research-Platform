import { pgTable, serial, text, numeric, timestamp, integer, date, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyPerformanceTable = pgTable("daily_performance", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  trades: integer("trades").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  breakevens: integer("breakevens").notNull().default(0),
  pnl: numeric("pnl", { precision: 20, scale: 8 }).notNull().default("0"),
  winRate: numeric("win_rate", { precision: 6, scale: 4 }).notNull().default("0"),
  avgScore: numeric("avg_score", { precision: 5, scale: 2 }).notNull().default("0"),
  bestTradeId: text("best_trade_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("uq_daily_performance_date").on(table.date),
]);

export const insertDailyPerformanceSchema = createInsertSchema(dailyPerformanceTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyPerformance = z.infer<typeof insertDailyPerformanceSchema>;
export type DailyPerformance = typeof dailyPerformanceTable.$inferSelect;
