import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const strategyVersionsTable = pgTable("strategy_versions", {
  id: serial("id").primaryKey(),
  strategyId: text("strategy_id").notNull(),
  version: text("version").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sourceHash: text("source_hash"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_strategy_versions_strategy_id").on(table.strategyId),
  index("idx_strategy_versions_version").on(table.version),
]);

export const insertStrategyVersionSchema = createInsertSchema(strategyVersionsTable).omit({ id: true, createdAt: true });
export type InsertStrategyVersion = z.infer<typeof insertStrategyVersionSchema>;
export type StrategyVersion = typeof strategyVersionsTable.$inferSelect;
