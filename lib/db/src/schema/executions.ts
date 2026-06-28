import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const executionsTable = pgTable("executions", {
  id: serial("id").primaryKey(),
  executionId: text("execution_id").notNull().unique(),
  orderId: text("order_id").notNull(),
  orderRowId: integer("order_row_id").references(() => ordersTable.id),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  status: text("status").notNull(),
  requestedQuantity: numeric("requested_quantity", { precision: 20, scale: 8 }).notNull(),
  filledQuantity: numeric("filled_quantity", { precision: 20, scale: 8 }).notNull(),
  remainingQuantity: numeric("remaining_quantity", { precision: 20, scale: 8 }).notNull(),
  averageFillPrice: numeric("average_fill_price", { precision: 20, scale: 8 }).notNull(),
  entrySlippage: numeric("entry_slippage", { precision: 20, scale: 8 }).notNull().default("0"),
  exitSlippage: numeric("exit_slippage", { precision: 20, scale: 8 }).notNull().default("0"),
  executionDelayMs: integer("execution_delay_ms").notNull().default(0),
  fillRatio: numeric("fill_ratio", { precision: 10, scale: 6 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_executions_order_id").on(table.orderId),
  index("idx_executions_symbol").on(table.symbol),
  index("idx_executions_status").on(table.status),
]);

export const insertExecutionSchema = createInsertSchema(executionsTable).omit({ id: true, createdAt: true });
export type InsertExecution = z.infer<typeof insertExecutionSchema>;
export type Execution = typeof executionsTable.$inferSelect;
