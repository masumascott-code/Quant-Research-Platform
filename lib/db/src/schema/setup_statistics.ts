import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const setupStatisticsTable = pgTable("setup_statistics", {
  id: serial("id").primaryKey(),
  setupType: text("setup_type").notNull(), // e.g. 'breakout_retest_long', 'breakdown_retest_short'
  direction: text("direction").notNull(),
  totalTrades: integer("total_trades").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  breakevens: integer("breakevens").notNull().default(0),
  winRate: numeric("win_rate", { precision: 6, scale: 4 }).notNull().default("0"),
  avgPnl: numeric("avg_pnl", { precision: 10, scale: 4 }).notNull().default("0"),
  avgScore: numeric("avg_score", { precision: 5, scale: 2 }).notNull().default("0"),
  ranking: integer("ranking"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSetupStatSchema = createInsertSchema(setupStatisticsTable).omit({ id: true, updatedAt: true });
export type InsertSetupStat = z.infer<typeof insertSetupStatSchema>;
export type SetupStat = typeof setupStatisticsTable.$inferSelect;
