import { pgTable, serial, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feesTable = pgTable("fees", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull(),
  tradeId: text("trade_id"),
  symbol: text("symbol").notNull(),
  makerFee: numeric("maker_fee", { precision: 20, scale: 8 }).notNull().default("0"),
  takerFee: numeric("taker_fee", { precision: 20, scale: 8 }).notNull().default("0"),
  tradingFee: numeric("trading_fee", { precision: 20, scale: 8 }).notNull().default("0"),
  commission: numeric("commission", { precision: 20, scale: 8 }).notNull().default("0"),
  fundingFee: numeric("funding_fee", { precision: 20, scale: 8 }).notNull().default("0"),
  totalFee: numeric("total_fee", { precision: 20, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_fees_order_id").on(table.orderId),
  index("idx_fees_trade_id").on(table.tradeId),
  index("idx_fees_symbol").on(table.symbol),
]);

export const insertFeeSchema = createInsertSchema(feesTable).omit({ id: true, createdAt: true });
export type InsertFee = z.infer<typeof insertFeeSchema>;
export type Fee = typeof feesTable.$inferSelect;
