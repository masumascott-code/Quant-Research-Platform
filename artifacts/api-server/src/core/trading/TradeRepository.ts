import { db, paperTradesTable, signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type PaperTradeRecord = typeof paperTradesTable.$inferSelect;
export type InsertPaperTradeValues = typeof paperTradesTable.$inferInsert;

export class TradeRepository {
  async findById(id: number): Promise<PaperTradeRecord | null> {
    const [trade] = await db.select().from(paperTradesTable).where(eq(paperTradesTable.id, id));
    return trade ?? null;
  }

  async findOpen(): Promise<PaperTradeRecord[]> {
    return await db.select().from(paperTradesTable).where(eq(paperTradesTable.status, "open"));
  }

  async create(values: InsertPaperTradeValues): Promise<PaperTradeRecord> {
    const [trade] = await db.insert(paperTradesTable).values(values).returning();
    if (!trade) throw new Error("Failed to create paper trade");
    return trade;
  }

  async markSignalTraded(signalId: number): Promise<void> {
    await db.update(signalsTable).set({ status: "traded" }).where(eq(signalsTable.id, signalId));
  }

  async updateById(id: number, values: Partial<InsertPaperTradeValues>): Promise<PaperTradeRecord> {
    const [trade] = await db
      .update(paperTradesTable)
      .set(values)
      .where(eq(paperTradesTable.id, id))
      .returning();
    if (!trade) throw new Error(`Failed to update trade ${id}`);
    return trade;
  }
}
