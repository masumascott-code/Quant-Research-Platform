import { pgTable, serial, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scannerDecisionsTable = pgTable("scanner_decisions", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  decision: text("decision").notNull(),
  strategy: text("strategy").notNull(),
  finalScore: numeric("final_score", { precision: 10, scale: 4 }).notNull(),
  technicalScore: numeric("technical_score", { precision: 10, scale: 4 }).notNull(),
  confidence: numeric("confidence", { precision: 10, scale: 4 }).notNull(),
  marketRegime: text("market_regime").notNull(),
  opportunityRank: numeric("opportunity_rank", { precision: 10, scale: 4 }),
  riskGrade: text("risk_grade").notNull(),
  reasons: jsonb("reasons").notNull(),
  riskSummary: jsonb("risk_summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_scanner_decisions_symbol").on(table.symbol),
  index("idx_scanner_decisions_created_at").on(table.createdAt),
]);

export const insertScannerDecisionSchema = createInsertSchema(scannerDecisionsTable).omit({ id: true, createdAt: true });
export type InsertScannerDecision = z.infer<typeof insertScannerDecisionSchema>;
export type ScannerDecision = typeof scannerDecisionsTable.$inferSelect;
