import { Router } from "express";
import { db } from "@workspace/db";
import { paperTradesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { tradeService, TradeServiceError } from "../core/trading";

const router = Router();

function parseCloseBody(body: any): { exitPrice: number; exitReason: string } | null {
  if (!body || typeof body.exitPrice !== "number" || body.exitPrice <= 0) return null;
  if (typeof body.exitReason !== "string" || body.exitReason.trim().length === 0) return null;
  return { exitPrice: body.exitPrice, exitReason: body.exitReason.trim() };
}

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { status, direction, result, source, scannerType } = req.query;

  const conditions = [];
  if (status && ["open", "closed"].includes(status as string)) {
    conditions.push(eq(paperTradesTable.status, status as string));
  }
  if (direction && ["LONG", "SHORT"].includes(direction as string)) {
    conditions.push(eq(paperTradesTable.direction, direction as string));
  }
  if (result && ["WIN", "LOSS", "BREAKEVEN"].includes(result as string)) {
    conditions.push(eq(paperTradesTable.result, result as string));
  }
  if (source && ["TECHNICAL", "SMC"].includes(source as string)) {
    conditions.push(eq(paperTradesTable.source, source as string));
  }
  if (scannerType && ["TECHNICAL_SCANNER", "SMC_SCANNER"].includes(scannerType as string)) {
    conditions.push(eq(paperTradesTable.scannerType, scannerType as string));
  }

  const trades = await db
    .select()
    .from(paperTradesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(paperTradesTable.openedAt))
    .limit(limit);

  res.json(trades.map(formatTrade));
});

router.get("/open", async (req, res) => {
  const { source, scannerType } = req.query;
  const conditions = [eq(paperTradesTable.status, "open")];
  if (source && ["TECHNICAL", "SMC"].includes(source as string)) {
    conditions.push(eq(paperTradesTable.source, source as string));
  }
  if (scannerType && ["TECHNICAL_SCANNER", "SMC_SCANNER"].includes(scannerType as string)) {
    conditions.push(eq(paperTradesTable.scannerType, scannerType as string));
  }

  const trades = await db
    .select()
    .from(paperTradesTable)
    .where(and(...conditions))
    .orderBy(desc(paperTradesTable.openedAt));

  res.json(trades.map(formatTrade));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [trade] = await db.select().from(paperTradesTable).where(eq(paperTradesTable.id, id));
  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json(formatTrade(trade));
});

router.post("/:id/close", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = parseCloseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  try {
    const updated = await tradeService.closeTradeById(id, {
      exitPrice: parsed.exitPrice,
      exitReason: parsed.exitReason,
      trigger: "MANUAL",
    });
    res.json(formatTrade(updated));
  } catch (err) {
    if (err instanceof TradeServiceError && err.code === "NOT_FOUND") {
      res.status(404).json({ error: "Trade not found" });
      return;
    }
    if (err instanceof TradeServiceError && err.code === "ALREADY_CLOSED") {
      res.status(400).json({ error: "Trade already closed" });
      return;
    }
    if (err instanceof TradeServiceError && err.code === "EXECUTION_REJECTED") {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

function formatTrade(t: any) {
  return {
    id: t.id,
    tradeId: t.tradeId,
    symbol: t.symbol,
    direction: t.direction,
    source: t.source ?? "TECHNICAL",
    scannerType: t.scannerType ?? "TECHNICAL_SCANNER",
    strategyType: t.strategyType ?? "TECHNICAL",
    strategyLabel: t.strategyLabel,
    badge: t.badge,
    smcScore: t.smcScore ? Number(t.smcScore) : null,
    smcDetails: t.smcDetails ?? null,
    entryPrice: Number(t.entryPrice),
    stopLoss: Number(t.stopLoss),
    currentSl: t.currentSl ? Number(t.currentSl) : null,
    tp1: Number(t.tp1),
    tp2: Number(t.tp2),
    tp3: Number(t.tp3),
    quantity: Number(t.quantity),
    signalScore: Number(t.signalScore),
    signalGrade: t.signalGrade,
    reason: t.reason,
    slReason: t.slReason,
    status: t.status,
    result: t.result,
    tp1Hit: t.tp1Hit,
    tp2Hit: t.tp2Hit,
    tp3Hit: t.tp3Hit,
    exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
    exitReason: t.exitReason,
    pnl: t.pnl ? Number(t.pnl) : null,
    pnlPercent: t.pnlPercent ? Number(t.pnlPercent) : null,
    holdingDurationMinutes: t.holdingDurationMinutes,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
  };
}

export default router;
