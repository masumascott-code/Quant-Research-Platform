import { pgTable, serial, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { strategyVersionsTable } from "./strategy_versions";

export const experimentsTable = pgTable("experiments", {
  id: serial("id").primaryKey(),
  experimentId: text("experiment_id").notNull().unique(),
  strategyVersionId: integer("strategy_version_id").references(() => strategyVersionsTable.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("PENDING"),
  marketRegime: text("market_regime"),
  exchange: text("exchange").notNull().default("BINANCE"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_experiments_experiment_id").on(table.experimentId),
  index("idx_experiments_strategy_version_id").on(table.strategyVersionId),
  index("idx_experiments_status").on(table.status),
]);

export const insertExperimentSchema = createInsertSchema(experimentsTable).omit({ id: true, createdAt: true });
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;
export type Experiment = typeof experimentsTable.$inferSelect;
