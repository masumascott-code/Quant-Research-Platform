import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signalsTable = pgTable("signals", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(), // 'LONG' | 'SHORT'
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
  grade: text("grade").notNull(), // 'A+' | 'A'
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  stopLoss: numeric("stop_loss", { precision: 20, scale: 8 }).notNull(),
  tp1: numeric("tp1", { precision: 20, scale: 8 }).notNull(),
  tp2: numeric("tp2", { precision: 20, scale: 8 }).notNull(),
  tp3: numeric("tp3", { precision: 20, scale: 8 }).notNull(),
  rrRatio: numeric("rr_ratio", { precision: 6, scale: 2 }),
  status: text("status").notNull().default("pending"), // 'pending' | 'active' | 'expired' | 'traded'
  reason: text("reason").notNull(),
  slReason: text("sl_reason"),
  trendScore: numeric("trend_score", { precision: 5, scale: 2 }),
  structureScore: numeric("structure_score", { precision: 5, scale: 2 }),
  volumeScore: numeric("volume_score", { precision: 5, scale: 2 }),
  breakoutScore: numeric("breakout_score", { precision: 5, scale: 2 }),
  retestScore: numeric("retest_score", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_signals_symbol").on(table.symbol),
  index("idx_signals_status").on(table.status),
  index("idx_signals_created_at").on(table.createdAt),
]);

export const insertSignalSchema = createInsertSchema(signalsTable).omit({ id: true, createdAt: true });
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;
