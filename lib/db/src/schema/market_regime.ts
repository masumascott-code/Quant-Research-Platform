import { pgTable, serial, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketRegimeTable = pgTable("market_regime", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  regime: text("regime").notNull(),
  strength: numeric("strength", { precision: 10, scale: 4 }).notNull(),
  confidence: numeric("confidence", { precision: 10, scale: 4 }).notNull(),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
}, (table) => [
  index("idx_market_regime_symbol").on(table.symbol),
  index("idx_market_regime_detected_at").on(table.detectedAt),
]);

export const insertMarketRegimeSchema = createInsertSchema(marketRegimeTable).omit({ id: true, detectedAt: true });
export type InsertMarketRegime = z.infer<typeof insertMarketRegimeSchema>;
export type MarketRegime = typeof marketRegimeTable.$inferSelect;
