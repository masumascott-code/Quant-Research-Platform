import { pgTable, serial, text, boolean, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coinsTable = pgTable("coins", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  baseAsset: text("base_asset").notNull(),
  quoteAsset: text("quote_asset").notNull().default("USDT"),
  isActive: boolean("is_active").notNull().default(true),
  lastPrice: numeric("last_price", { precision: 20, scale: 8 }),
  volume24h: numeric("volume_24h", { precision: 30, scale: 2 }),
  priceChangePercent: numeric("price_change_percent", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCoinSchema = createInsertSchema(coinsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoin = z.infer<typeof insertCoinSchema>;
export type Coin = typeof coinsTable.$inferSelect;
