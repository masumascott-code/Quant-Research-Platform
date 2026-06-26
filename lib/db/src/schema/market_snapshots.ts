import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { coinsTable } from "./coins";

export const marketSnapshotsTable = pgTable("market_snapshots", {
  id: serial("id").primaryKey(),
  coinId: integer("coin_id").notNull().references(() => coinsTable.id),
  symbol: text("symbol").notNull(),
  price: numeric("price", { precision: 20, scale: 8 }).notNull(),
  priceChangePercent: numeric("price_change_percent", { precision: 10, scale: 4 }).notNull(),
  volume24h: numeric("volume_24h", { precision: 30, scale: 2 }).notNull(),
  rvol: numeric("rvol", { precision: 10, scale: 4 }).notNull().default("0"),
  rank: integer("rank").notNull().default(0),
  listType: text("list_type").notNull(), // 'gainer' | 'loser'
  ema20: numeric("ema20", { precision: 20, scale: 8 }),
  ema50: numeric("ema50", { precision: 20, scale: 8 }),
  atr14: numeric("atr14", { precision: 20, scale: 8 }),
  trend: text("trend"), // 'bullish' | 'bearish' | 'neutral'
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
}, (table) => [
  index("idx_snapshots_symbol").on(table.symbol),
  index("idx_snapshots_scanned_at").on(table.scannedAt),
  index("idx_snapshots_list_type").on(table.listType),
]);

export const insertMarketSnapshotSchema = createInsertSchema(marketSnapshotsTable).omit({ id: true });
export type InsertMarketSnapshot = z.infer<typeof insertMarketSnapshotSchema>;
export type MarketSnapshot = typeof marketSnapshotsTable.$inferSelect;
