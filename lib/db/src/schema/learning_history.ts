import { pgTable, serial, text, numeric, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adaptiveLearningTable } from "./adaptive_learning";
import { recommendationsTable } from "./recommendations";

export const learningHistoryTable = pgTable("learning_history", {
  id: serial("id").primaryKey(),
  learningRunId: integer("learning_run_id").references(() => adaptiveLearningTable.id),
  recommendationRowId: integer("recommendation_row_id").references(() => recommendationsTable.id),
  eventType: text("event_type").notNull(),
  beforeMetrics: jsonb("before_metrics").notNull(),
  afterMetrics: jsonb("after_metrics"),
  performanceDelta: numeric("performance_delta", { precision: 10, scale: 4 }),
  humanDecision: text("human_decision").notNull().default("PENDING"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_learning_history_run").on(table.learningRunId),
  index("idx_learning_history_recommendation").on(table.recommendationRowId),
  index("idx_learning_history_event").on(table.eventType),
]);

export const insertLearningHistorySchema = createInsertSchema(learningHistoryTable).omit({ id: true, createdAt: true });
export type InsertLearningHistory = z.infer<typeof insertLearningHistorySchema>;
export type LearningHistory = typeof learningHistoryTable.$inferSelect;
