import { Router } from "express";
import { db } from "@workspace/db";
import { scannerDecisionsTable, watchlistTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const active = await db.select().from(watchlistTable)
      .where(eq(watchlistTable.isActive, true))
      .orderBy(desc(watchlistTable.createdAt));

    const history = await db.select().from(watchlistTable)
      .where(eq(watchlistTable.isActive, false))
      .orderBy(desc(watchlistTable.createdAt))
      .limit(50);

    res.json({
      active: await enrichWithLatestDecision(active),
      history: await enrichWithLatestDecision(history),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch watchlist" });
  }
});

async function enrichWithLatestDecision<T extends typeof watchlistTable.$inferSelect>(items: T[]) {
  return await Promise.all(items.map(async (item) => {
    const [latestDecision] = await db
      .select()
      .from(scannerDecisionsTable)
      .where(and(
        eq(scannerDecisionsTable.symbol, item.symbol),
        eq(scannerDecisionsTable.direction, item.direction),
      ))
      .orderBy(desc(scannerDecisionsTable.createdAt))
      .limit(1);

    if (!latestDecision) return item;

    return {
      ...item,
      score: latestDecision.finalScore,
      decisionConfidence: Number(latestDecision.confidence),
      latestScoreAt: latestDecision.createdAt,
    };
  }));
}

export default router;
