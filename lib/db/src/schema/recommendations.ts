import { pgTable, serial, text, numeric, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adaptiveLearningTable } from "./adaptive_learning";

export const recommendationsTable = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  learningRunId: integer("learning_run_id").references(() => adaptiveLearningTable.id),
  recommendationId: text("recommendation_id").notNull().unique(),
  category: text("category").notNull(),
  target: text("target").notNull(),
  currentValue: jsonb("current_value"),
  recommendedValue: jsonb("recommended_value").notNull(),
  rationale: text("rationale").notNull(),
  confidence: numeric("confidence", { precision: 10, scale: 4 }).notNull(),
  impactEstimate: numeric("impact_estimate", { precision: 10, scale: 4 }).notNull(),
  evidence: jsonb("evidence").notNull(),
  status: text("status").notNull().default("PENDING_HUMAN_APPROVAL"),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_recommendations_run").on(table.learningRunId),
  index("idx_recommendations_status").on(table.status),
  index("idx_recommendations_category").on(table.category),
]);

export const insertRecommendationSchema = createInsertSchema(recommendationsTable).omit({
  id: true,
  acceptedAt: true,
  rejectedAt: true,
  createdAt: true,
});
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type Recommendation = typeof recommendationsTable.$inferSelect;
