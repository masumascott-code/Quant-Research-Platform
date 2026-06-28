import { pgTable, serial, text, numeric, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adaptiveLearningTable } from "./adaptive_learning";

export const edgeScoresTable = pgTable("edge_scores", {
  id: serial("id").primaryKey(),
  learningRunId: integer("learning_run_id").references(() => adaptiveLearningTable.id),
  scope: text("scope").notNull().default("PLATFORM"),
  improvementScore: numeric("improvement_score", { precision: 10, scale: 4 }).notNull(),
  learningScore: numeric("learning_score", { precision: 10, scale: 4 }).notNull(),
  edgeScore: numeric("edge_score", { precision: 10, scale: 4 }).notNull(),
  traderDisciplineScore: numeric("trader_discipline_score", { precision: 10, scale: 4 }).notNull(),
  consistencyScore: numeric("consistency_score", { precision: 10, scale: 4 }).notNull(),
  components: jsonb("components").notNull(),
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_edge_scores_run").on(table.learningRunId),
  index("idx_edge_scores_calculated_at").on(table.calculatedAt),
]);

export const insertEdgeScoreSchema = createInsertSchema(edgeScoresTable).omit({ id: true, calculatedAt: true });
export type InsertEdgeScore = z.infer<typeof insertEdgeScoreSchema>;
export type EdgeScore = typeof edgeScoresTable.$inferSelect;
