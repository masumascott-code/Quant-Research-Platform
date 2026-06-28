import { pgTable, serial, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const opportunityRankingsTable = pgTable("opportunity_rankings", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  rank: numeric("rank", { precision: 10, scale: 4 }).notNull(),
  confidence: numeric("confidence", { precision: 10, scale: 4 }).notNull(),
  momentumScore: numeric("momentum_score", { precision: 10, scale: 4 }).notNull(),
  riskGrade: text("risk_grade").notNull(),
  context: jsonb("context").notNull(),
  rankedAt: timestamp("ranked_at").notNull().defaultNow(),
}, (table) => [
  index("idx_opportunity_rankings_symbol").on(table.symbol),
  index("idx_opportunity_rankings_ranked_at").on(table.rankedAt),
]);

export const insertOpportunityRankingSchema = createInsertSchema(opportunityRankingsTable).omit({ id: true, rankedAt: true });
export type InsertOpportunityRanking = z.infer<typeof insertOpportunityRankingSchema>;
export type OpportunityRanking = typeof opportunityRankingsTable.$inferSelect;
