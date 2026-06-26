import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { paperTradesTable } from "./paper_trades";

export const tradeReviewsTable = pgTable("trade_reviews", {
  id: serial("id").primaryKey(),
  paperTradeId: integer("paper_trade_id").notNull().references(() => paperTradesTable.id),
  tradeId: text("trade_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  result: text("result").notNull(),
  analysisReason: text("analysis_reason").notNull(),
  lessonsLearned: text("lessons_learned").notNull(),
  improvementNotes: text("improvement_notes"),
  setupQuality: text("setup_quality"), // 'excellent' | 'good' | 'average' | 'poor'
  winningFactors: text("winning_factors"),
  losingFactors: text("losing_factors"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_reviews_trade_id").on(table.tradeId),
  index("idx_reviews_result").on(table.result),
]);

export const insertTradeReviewSchema = createInsertSchema(tradeReviewsTable).omit({ id: true, createdAt: true });
export type InsertTradeReview = z.infer<typeof insertTradeReviewSchema>;
export type TradeReview = typeof tradeReviewsTable.$inferSelect;
