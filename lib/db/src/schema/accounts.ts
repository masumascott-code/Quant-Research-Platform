import { pgTable, serial, text, numeric, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  accountKey: text("account_key").notNull().unique(),
  name: text("name").notNull(),
  accountType: text("account_type").notNull().default("paper"),
  currency: text("currency").notNull().default("USDT"),
  equity: numeric("equity", { precision: 20, scale: 8 }).notNull(),
  availableBalance: numeric("available_balance", { precision: 20, scale: 8 }).notNull(),
  usedMargin: numeric("used_margin", { precision: 20, scale: 8 }).notNull().default("0"),
  leverage: numeric("leverage", { precision: 10, scale: 4 }).notNull().default("1"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_accounts_account_type").on(table.accountType),
  index("idx_accounts_is_active").on(table.isActive),
]);

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
