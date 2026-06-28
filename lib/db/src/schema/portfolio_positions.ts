import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { paperTradesTable } from "./paper_trades";

export const portfolioPositionsTable = pgTable("portfolio_positions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  paperTradeId: integer("paper_trade_id").references(() => paperTradesTable.id),
  tradeId: text("trade_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  assetClass: text("asset_class").notNull().default("crypto"),
  sector: text("sector").notNull().default("crypto"),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  notional: numeric("notional", { precision: 20, scale: 8 }).notNull(),
  marginUsed: numeric("margin_used", { precision: 20, scale: 8 }).notNull(),
  riskAmount: numeric("risk_amount", { precision: 20, scale: 8 }).notNull(),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => [
  index("idx_portfolio_positions_account_id").on(table.accountId),
  index("idx_portfolio_positions_symbol").on(table.symbol),
  index("idx_portfolio_positions_status").on(table.status),
  index("idx_portfolio_positions_trade_id").on(table.tradeId),
]);

export const insertPortfolioPositionSchema = createInsertSchema(portfolioPositionsTable).omit({ id: true, openedAt: true });
export type InsertPortfolioPosition = z.infer<typeof insertPortfolioPositionSchema>;
export type PortfolioPosition = typeof portfolioPositionsTable.$inferSelect;
