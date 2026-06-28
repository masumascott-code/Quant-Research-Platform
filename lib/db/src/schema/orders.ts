import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { paperTradesTable } from "./paper_trades";
import { signalsTable } from "./signals";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  accountId: integer("account_id").references(() => accountsTable.id),
  signalId: integer("signal_id").references(() => signalsTable.id),
  paperTradeId: integer("paper_trade_id").references(() => paperTradesTable.id),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  orderType: text("order_type").notNull(),
  status: text("status").notNull().default("NEW"),
  requestedQuantity: numeric("requested_quantity", { precision: 20, scale: 8 }).notNull(),
  filledQuantity: numeric("filled_quantity", { precision: 20, scale: 8 }).notNull().default("0"),
  remainingQuantity: numeric("remaining_quantity", { precision: 20, scale: 8 }).notNull(),
  limitPrice: numeric("limit_price", { precision: 20, scale: 8 }),
  stopPrice: numeric("stop_price", { precision: 20, scale: 8 }),
  averageFillPrice: numeric("average_fill_price", { precision: 20, scale: 8 }),
  executionDelayMs: integer("execution_delay_ms").notNull().default(0),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_orders_order_id").on(table.orderId),
  index("idx_orders_symbol").on(table.symbol),
  index("idx_orders_status").on(table.status),
  index("idx_orders_signal_id").on(table.signalId),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
