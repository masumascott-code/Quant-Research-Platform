import { pgTable, serial, text, numeric, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { experimentsTable } from "./experiments";
import { parameterSetsTable } from "./parameter_sets";

export const walkForwardResultsTable = pgTable("walk_forward_results", {
  id: serial("id").primaryKey(),
  experimentId: integer("experiment_id").references(() => experimentsTable.id),
  windowIndex: integer("window_index").notNull(),
  trainingStart: timestamp("training_start").notNull(),
  trainingEnd: timestamp("training_end").notNull(),
  validationStart: timestamp("validation_start").notNull(),
  validationEnd: timestamp("validation_end").notNull(),
  selectedParameterSetId: integer("selected_parameter_set_id").references(() => parameterSetsTable.id),
  trainingScore: numeric("training_score", { precision: 20, scale: 8 }).notNull(),
  validationScore: numeric("validation_score", { precision: 20, scale: 8 }).notNull(),
  metrics: jsonb("metrics").notNull(),
  status: text("status").notNull().default("COMPLETED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_walk_forward_results_experiment_id").on(table.experimentId),
  index("idx_walk_forward_results_window").on(table.windowIndex),
]);

export const insertWalkForwardResultSchema = createInsertSchema(walkForwardResultsTable).omit({ id: true, createdAt: true });
export type InsertWalkForwardResult = z.infer<typeof insertWalkForwardResultSchema>;
export type WalkForwardResult = typeof walkForwardResultsTable.$inferSelect;
