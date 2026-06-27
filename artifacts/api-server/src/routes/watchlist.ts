import { Router } from "express";
import { db } from "@workspace/db";
import { watchlistTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

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

    res.json({ active, history });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch watchlist" });
  }
});

export default router;
