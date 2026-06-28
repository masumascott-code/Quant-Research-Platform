import { pgTable, serial, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketContextTable = pgTable("market_context", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  marketRegime: text("market_regime").notNull(),
  session: text("session").notNull(),
  confidence: numeric("confidence", { precision: 10, scale: 4 }).notNull(),
  liquidityScore: numeric("liquidity_score", { precision: 10, scale: 4 }).notNull(),
  trendScore: numeric("trend_score", { precision: 10, scale: 4 }).notNull(),
  volumeScore: numeric("volume_score", { precision: 10, scale: 4 }).notNull(),
  volatilityScore: numeric("volatility_score", { precision: 10, scale: 4 }).notNull(),
  opportunityRank: numeric("opportunity_rank", { precision: 10, scale: 4 }),
  riskGrade: text("risk_grade").notNull(),
  context: jsonb("context").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_market_context_symbol").on(table.symbol),
  index("idx_market_context_created_at").on(table.createdAt),
]);

export const insertMarketContextSchema = createInsertSchema(marketContextTable).omit({ id: true, createdAt: true });
export type InsertMarketContext = z.infer<typeof insertMarketContextSchema>;
export type MarketContext = typeof marketContextTable.$inferSelect;
