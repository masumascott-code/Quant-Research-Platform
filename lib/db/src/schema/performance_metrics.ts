import { pgTable, serial, text, numeric, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { backtestsTable } from "./backtests";
import { experimentsTable } from "./experiments";

export const performanceMetricsTable = pgTable("performance_metrics", {
  id: serial("id").primaryKey(),
  backtestId: integer("backtest_id").references(() => backtestsTable.id),
  experimentId: integer("experiment_id").references(() => experimentsTable.id),
  scope: text("scope").notNull().default("BACKTEST"),
  winRate: numeric("win_rate", { precision: 10, scale: 4 }).notNull(),
  profitFactor: numeric("profit_factor", { precision: 20, scale: 8 }).notNull(),
  expectancy: numeric("expectancy", { precision: 20, scale: 8 }).notNull(),
  sharpeRatio: numeric("sharpe_ratio", { precision: 20, scale: 8 }).notNull(),
  sortinoRatio: numeric("sortino_ratio", { precision: 20, scale: 8 }).notNull(),
  calmarRatio: numeric("calmar_ratio", { precision: 20, scale: 8 }).notNull(),
  maxDrawdown: numeric("max_drawdown", { precision: 20, scale: 8 }).notNull(),
  averageHoldMinutes: numeric("average_hold_minutes", { precision: 20, scale: 8 }).notNull(),
  averageRMultiple: numeric("average_r_multiple", { precision: 20, scale: 8 }).notNull(),
  averageRisk: numeric("average_risk", { precision: 20, scale: 8 }).notNull(),
  totalReturn: numeric("total_return", { precision: 20, scale: 8 }).notNull(),
  tradeCount: integer("trade_count").notNull(),
  equityCurve: jsonb("equity_curve").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_performance_metrics_backtest_id").on(table.backtestId),
  index("idx_performance_metrics_experiment_id").on(table.experimentId),
  index("idx_performance_metrics_scope").on(table.scope),
]);

export const insertPerformanceMetricSchema = createInsertSchema(performanceMetricsTable).omit({ id: true, createdAt: true });
export type InsertPerformanceMetric = z.infer<typeof insertPerformanceMetricSchema>;
export type PerformanceMetric = typeof performanceMetricsTable.$inferSelect;
