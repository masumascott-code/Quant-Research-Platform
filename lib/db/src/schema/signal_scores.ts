import { pgTable, serial, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signalScoresTable = pgTable("signal_scores", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  finalScore: numeric("final_score", { precision: 10, scale: 4 }).notNull(),
  technicalScore: numeric("technical_score", { precision: 10, scale: 4 }).notNull(),
  marketRegimeScore: numeric("market_regime_score", { precision: 10, scale: 4 }).notNull(),
  liquidityScore: numeric("liquidity_score", { precision: 10, scale: 4 }).notNull(),
  volumeScore: numeric("volume_score", { precision: 10, scale: 4 }).notNull(),
  trendScore: numeric("trend_score", { precision: 10, scale: 4 }).notNull(),
  volatilityScore: numeric("volatility_score", { precision: 10, scale: 4 }).notNull(),
  sessionScore: numeric("session_score", { precision: 10, scale: 4 }).notNull(),
  riskRewardScore: numeric("risk_reward_score", { precision: 10, scale: 4 }).notNull(),
  weights: jsonb("weights").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_signal_scores_symbol").on(table.symbol),
  index("idx_signal_scores_created_at").on(table.createdAt),
]);

export const insertSignalScoreSchema = createInsertSchema(signalScoresTable).omit({ id: true, createdAt: true });
export type InsertSignalScore = z.infer<typeof insertSignalScoreSchema>;
export type SignalScore = typeof signalScoresTable.$inferSelect;
