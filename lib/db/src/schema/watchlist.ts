import { pgTable, serial, text, numeric, timestamp, boolean, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  source: text("source").notNull().default("TECHNICAL"),
  scannerType: text("scanner_type").notNull().default("TECHNICAL_SCANNER"),
  strategyType: text("strategy_type").notNull().default("TECHNICAL"),
  strategyLabel: text("strategy_label"),
  badge: text("badge"),
  smcScore: numeric("smc_score", { precision: 5, scale: 2 }),
  smcDetails: jsonb("smc_details"),
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
  confidence: text("confidence").notNull().default("Medium"),
  setupType: text("setup_type"),
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  stopLoss: numeric("stop_loss", { precision: 20, scale: 8 }).notNull(),
  tp1: numeric("tp1", { precision: 20, scale: 8 }).notNull(),
  tp2: numeric("tp2", { precision: 20, scale: 8 }).notNull(),
  tp3: numeric("tp3", { precision: 20, scale: 8 }).notNull(),
  rrRatio: numeric("rr_ratio", { precision: 6, scale: 2 }),
  reason: text("reason").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  promoted: boolean("promoted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_watchlist_symbol").on(table.symbol),
  index("idx_watchlist_active").on(table.isActive),
  index("idx_watchlist_source").on(table.source),
  index("idx_watchlist_scanner_type").on(table.scannerType),
  index("idx_watchlist_created_at").on(table.createdAt),
]);

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({ id: true, createdAt: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlistTable.$inferSelect;
