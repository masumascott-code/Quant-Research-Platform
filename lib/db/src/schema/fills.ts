import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const fillsTable = pgTable("fills", {
  id: serial("id").primaryKey(),
  fillId: text("fill_id").notNull().unique(),
  orderId: text("order_id").notNull(),
  orderRowId: integer("order_row_id").references(() => ordersTable.id),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  price: numeric("price", { precision: 20, scale: 8 }).notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  liquidityRole: text("liquidity_role").notNull(),
  fee: numeric("fee", { precision: 20, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_fills_order_id").on(table.orderId),
  index("idx_fills_symbol").on(table.symbol),
]);

export const insertFillSchema = createInsertSchema(fillsTable).omit({ id: true, createdAt: true });
export type InsertFill = z.infer<typeof insertFillSchema>;
export type Fill = typeof fillsTable.$inferSelect;
