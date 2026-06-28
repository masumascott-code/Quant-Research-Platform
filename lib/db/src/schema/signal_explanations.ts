import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signalExplanationsTable = pgTable("signal_explanations", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  signalGrade: text("signal_grade").notNull(),
  whySelected: jsonb("why_selected").notNull(),
  whyRejected: jsonb("why_rejected").notNull(),
  confidenceFactors: jsonb("confidence_factors").notNull(),
  riskFactors: jsonb("risk_factors").notNull(),
  marketContext: jsonb("market_context").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_signal_explanations_symbol").on(table.symbol),
  index("idx_signal_explanations_created_at").on(table.createdAt),
]);

export const insertSignalExplanationSchema = createInsertSchema(signalExplanationsTable).omit({ id: true, createdAt: true });
export type InsertSignalExplanation = z.infer<typeof insertSignalExplanationSchema>;
export type SignalExplanation = typeof signalExplanationsTable.$inferSelect;
