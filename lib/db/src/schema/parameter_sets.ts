import { pgTable, serial, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { strategyVersionsTable } from "./strategy_versions";

export const parameterSetsTable = pgTable("parameter_sets", {
  id: serial("id").primaryKey(),
  strategyVersionId: integer("strategy_version_id").references(() => strategyVersionsTable.id),
  name: text("name").notNull(),
  parameters: jsonb("parameters").notNull(),
  optimizer: text("optimizer"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_parameter_sets_strategy_version_id").on(table.strategyVersionId),
  index("idx_parameter_sets_name").on(table.name),
]);

export const insertParameterSetSchema = createInsertSchema(parameterSetsTable).omit({ id: true, createdAt: true });
export type InsertParameterSet = z.infer<typeof insertParameterSetSchema>;
export type ParameterSet = typeof parameterSetsTable.$inferSelect;
