import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";

export const portfolioTable = pgTable("portfolio", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  name: text("name").notNull().default("Default Portfolio"),
  currency: text("currency").notNull().default("USDT"),
  totalEquity: numeric("total_equity", { precision: 20, scale: 8 }).notNull(),
  usedEquity: numeric("used_equity", { precision: 20, scale: 8 }).notNull().default("0"),
  freeEquity: numeric("free_equity", { precision: 20, scale: 8 }).notNull(),
  openExposure: numeric("open_exposure", { precision: 20, scale: 8 }).notNull().default("0"),
  dailyPnl: numeric("daily_pnl", { precision: 20, scale: 8 }).notNull().default("0"),
  riskUsagePercent: numeric("risk_usage_percent", { precision: 10, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_portfolio_account_id").on(table.accountId),
]);

export const insertPortfolioSchema = createInsertSchema(portfolioTable).omit({ id: true, updatedAt: true });
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolioTable.$inferSelect;
