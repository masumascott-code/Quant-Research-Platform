import { pgTable, serial, text, numeric, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adaptiveLearningTable = pgTable("adaptive_learning", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull().unique(),
  scope: text("scope").notNull().default("FULL_PLATFORM"),
  status: text("status").notNull().default("COMPLETED"),
  lookbackDays: integer("lookback_days").notNull().default(30),
  improvementScore: numeric("improvement_score", { precision: 10, scale: 4 }).notNull(),
  learningScore: numeric("learning_score", { precision: 10, scale: 4 }).notNull(),
  edgeScore: numeric("edge_score", { precision: 10, scale: 4 }).notNull(),
  traderDisciplineScore: numeric("trader_discipline_score", { precision: 10, scale: 4 }).notNull(),
  consistencyScore: numeric("consistency_score", { precision: 10, scale: 4 }).notNull(),
  detectedPatterns: jsonb("detected_patterns").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_adaptive_learning_run_id").on(table.runId),
  index("idx_adaptive_learning_created_at").on(table.createdAt),
]);

export const insertAdaptiveLearningSchema = createInsertSchema(adaptiveLearningTable).omit({ id: true, createdAt: true });
export type InsertAdaptiveLearning = z.infer<typeof insertAdaptiveLearningSchema>;
export type AdaptiveLearning = typeof adaptiveLearningTable.$inferSelect;
