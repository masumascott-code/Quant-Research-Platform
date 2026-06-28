import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { status, direction } = req.query;

  const conditions = [];
  if (status && ["pending", "active", "expired", "traded"].includes(status as string)) {
    conditions.push(eq(signalsTable.status, status as string));
  }
  if (direction && ["LONG", "SHORT"].includes(direction as string)) {
    conditions.push(eq(signalsTable.direction, direction as string));
  }

  const signals = await db
    .select()
    .from(signalsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(signalsTable.createdAt))
    .limit(limit);

  res.json(signals.map(formatSignal));
});

router.get("/active", async (req, res) => {
  const signals = await db
    .select()
    .from(signalsTable)
    .where(inArray(signalsTable.status, ["pending", "active"]))
    .orderBy(desc(signalsTable.score));

  res.json(signals.map(formatSignal));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [signal] = await db.select().from(signalsTable).where(eq(signalsTable.id, id));
  if (!signal) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }

  res.json(formatSignal(signal));
});

function formatSignal(s: any) {
  return {
    id: s.id,
    symbol: s.symbol,
    direction: s.direction,
    score: Number(s.score),
    grade: s.grade,
    entryPrice: Number(s.entryPrice),
    stopLoss: Number(s.stopLoss),
    tp1: Number(s.tp1),
    tp2: Number(s.tp2),
    tp3: Number(s.tp3),
    rrRatio: s.rrRatio ? Number(s.rrRatio) : null,
    status: s.status,
    reason: s.reason,
    slReason: s.slReason,
    trendScore: s.trendScore ? Number(s.trendScore) : null,
    structureScore: s.structureScore ? Number(s.structureScore) : null,
    volumeScore: s.volumeScore ? Number(s.volumeScore) : null,
    breakoutScore: s.breakoutScore ? Number(s.breakoutScore) : null,
    retestScore: s.retestScore ? Number(s.retestScore) : null,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  };
}

export default router;
