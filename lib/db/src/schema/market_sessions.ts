import { pgTable, serial, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketSessionsTable = pgTable("market_sessions", {
  id: serial("id").primaryKey(),
  session: text("session").notNull(),
  overlap: text("overlap"),
  qualityScore: numeric("quality_score", { precision: 10, scale: 4 }).notNull(),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
}, (table) => [
  index("idx_market_sessions_session").on(table.session),
  index("idx_market_sessions_detected_at").on(table.detectedAt),
]);

export const insertMarketSessionSchema = createInsertSchema(marketSessionsTable).omit({ id: true, detectedAt: true });
export type InsertMarketSession = z.infer<typeof insertMarketSessionSchema>;
export type MarketSession = typeof marketSessionsTable.$inferSelect;
