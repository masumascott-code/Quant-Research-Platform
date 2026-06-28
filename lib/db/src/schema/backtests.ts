import { pgTable, serial, text, numeric, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { parameterSetsTable } from "./parameter_sets";
import { strategyVersionsTable } from "./strategy_versions";

export const backtestsTable = pgTable("backtests", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull().unique(),
  strategyVersionId: integer("strategy_version_id").references(() => strategyVersionsTable.id),
  parameterSetId: integer("parameter_set_id").references(() => parameterSetsTable.id),
  status: text("status").notNull().default("PENDING"),
  symbol: text("symbol"),
  exchange: text("exchange").notNull().default("BINANCE"),
  timeframe: text("timeframe").notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  initialEquity: numeric("initial_equity", { precision: 20, scale: 8 }).notNull(),
  finalEquity: numeric("final_equity", { precision: 20, scale: 8 }),
  marketRegime: text("market_regime"),
  notes: text("notes"),
  config: jsonb("config"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_backtests_run_id").on(table.runId),
  index("idx_backtests_status").on(table.status),
  index("idx_backtests_strategy_version_id").on(table.strategyVersionId),
  index("idx_backtests_created_at").on(table.createdAt),
]);

export const insertBacktestSchema = createInsertSchema(backtestsTable).omit({ id: true, createdAt: true });
export type InsertBacktest = z.infer<typeof insertBacktestSchema>;
export type Backtest = typeof backtestsTable.$inferSelect;
