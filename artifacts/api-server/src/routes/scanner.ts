import { Router } from "express";
import { db } from "@workspace/db";
import {
  coinsTable,
  marketSnapshotsTable,
  signalsTable,
  paperTradesTable,
} from "@workspace/db";
import { eq, desc, sql, and, gte, count, sum } from "drizzle-orm";
import { ScannerService } from "../services/scanner";

const router = Router();

router.get("/status", async (req, res) => {
  const scanner = ScannerService.getInstance();
  const status = scanner.getStatus();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openTrades = await db
    .select({ count: count() })
    .from(paperTradesTable)
    .where(eq(paperTradesTable.status, "open"));

  const dailyTrades = await db
    .select({ count: count() })
    .from(paperTradesTable)
    .where(gte(paperTradesTable.openedAt, today));

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weeklyTrades = await db
    .select({ count: count() })
    .from(paperTradesTable)
    .where(gte(paperTradesTable.openedAt, weekStart));

  const totalCoins = await db.select({ count: count() }).from(coinsTable).where(eq(coinsTable.isActive, true));

  res.json({
    running: status.running,
    lastScanAt: status.lastScanAt,
    totalCoinsTracked: totalCoins[0]?.count ?? 0,
    openTrades: openTrades[0]?.count ?? 0,
    dailyTrades: dailyTrades[0]?.count ?? 0,
    weeklyTrades: weeklyTrades[0]?.count ?? 0,
    nextScanIn: status.nextScanIn,
  });
});

router.post("/start", async (req, res) => {
  const scanner = ScannerService.getInstance();
  await scanner.start();
  res.json({ success: true, message: "Scanner started" });
});

router.post("/stop", async (req, res) => {
  const scanner = ScannerService.getInstance();
  scanner.stop();
  res.json({ success: true, message: "Scanner stopped" });
});

router.get("/gainers", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const latestScan = await db.select({ maxId: sql<number>`max(id)` }).from(marketSnapshotsTable).where(eq(marketSnapshotsTable.listType, "gainer"));

  if (!latestScan[0]?.maxId) {
    res.json([]);
    return;
  }

  const latestScannedAt = await db
    .select({ scannedAt: marketSnapshotsTable.scannedAt })
    .from(marketSnapshotsTable)
    .where(eq(marketSnapshotsTable.id, latestScan[0].maxId));

  if (!latestScannedAt[0]) {
    res.json([]);
    return;
  }

  const scanTime = latestScannedAt[0].scannedAt;
  const from = new Date(scanTime.getTime() - 5 * 60 * 1000);

  const gainers = await db
    .select()
    .from(marketSnapshotsTable)
    .where(and(eq(marketSnapshotsTable.listType, "gainer"), gte(marketSnapshotsTable.scannedAt, from)))
    .orderBy(desc(marketSnapshotsTable.priceChangePercent))
    .limit(limit);

  res.json(gainers.map(formatSnapshot));
});

router.get("/losers", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const latestScan = await db.select({ maxId: sql<number>`max(id)` }).from(marketSnapshotsTable).where(eq(marketSnapshotsTable.listType, "loser"));

  if (!latestScan[0]?.maxId) {
    res.json([]);
    return;
  }

  const latestScannedAt = await db
    .select({ scannedAt: marketSnapshotsTable.scannedAt })
    .from(marketSnapshotsTable)
    .where(eq(marketSnapshotsTable.id, latestScan[0].maxId));

  if (!latestScannedAt[0]) {
    res.json([]);
    return;
  }

  const scanTime = latestScannedAt[0].scannedAt;
  const from = new Date(scanTime.getTime() - 5 * 60 * 1000);

  const losers = await db
    .select()
    .from(marketSnapshotsTable)
    .where(and(eq(marketSnapshotsTable.listType, "loser"), gte(marketSnapshotsTable.scannedAt, from)))
    .orderBy(sql`${marketSnapshotsTable.priceChangePercent} ASC`)
    .limit(limit);

  res.json(losers.map(formatSnapshot));
});

router.get("/coins", async (req, res) => {
  const coins = await db.select().from(coinsTable).where(eq(coinsTable.isActive, true)).orderBy(coinsTable.symbol);
  res.json(coins.map(c => ({
    ...c,
    lastPrice: c.lastPrice ? Number(c.lastPrice) : null,
    volume24h: c.volume24h ? Number(c.volume24h) : null,
    priceChangePercent: c.priceChangePercent ? Number(c.priceChangePercent) : null,
  })));
});

router.get("/dashboard", async (req, res) => {
  const scanner = ScannerService.getInstance();
  const status = scanner.getStatus();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalCoins, gainersCount, losersCount, activeSignals, openTrades, todayPerf, allTrades] = await Promise.all([
    db.select({ count: count() }).from(coinsTable).where(eq(coinsTable.isActive, true)),
    db.select({ count: count() }).from(marketSnapshotsTable).where(eq(marketSnapshotsTable.listType, "gainer")),
    db.select({ count: count() }).from(marketSnapshotsTable).where(eq(marketSnapshotsTable.listType, "loser")),
    db.select({ count: count() }).from(signalsTable).where(eq(signalsTable.status, "active")),
    db.select({ count: count() }).from(paperTradesTable).where(eq(paperTradesTable.status, "open")),
    db.select({ pnl: sum(paperTradesTable.pnl) }).from(paperTradesTable).where(and(eq(paperTradesTable.status, "closed"), gte(paperTradesTable.closedAt, today))),
    db.select({ pnl: sum(paperTradesTable.pnl), wins: count() }).from(paperTradesTable).where(eq(paperTradesTable.status, "closed")),
  ]);

  const closedCount = await db.select({ count: count() }).from(paperTradesTable).where(eq(paperTradesTable.status, "closed"));
  const winCount = await db.select({ count: count() }).from(paperTradesTable).where(and(eq(paperTradesTable.status, "closed"), eq(paperTradesTable.result, "WIN")));

  const totalPnl = allTrades[0]?.pnl ? Number(allTrades[0].pnl) : 0;
  const winRate = closedCount[0]?.count ? (winCount[0]?.count ?? 0) / closedCount[0].count : 0;

  res.json({
    scannerRunning: status.running,
    totalCoins: totalCoins[0]?.count ?? 0,
    topGainersCount: gainersCount[0]?.count ?? 0,
    topLosersCount: losersCount[0]?.count ?? 0,
    activeSignals: activeSignals[0]?.count ?? 0,
    openTrades: openTrades[0]?.count ?? 0,
    todayPnl: todayPerf[0]?.pnl ? Number(todayPerf[0].pnl) : 0,
    totalPnl,
    winRate,
    lastScanAt: status.lastScanAt,
  });
});

function formatSnapshot(s: any) {
  return {
    id: s.id,
    symbol: s.symbol,
    price: Number(s.price),
    priceChangePercent: Number(s.priceChangePercent),
    volume24h: Number(s.volume24h),
    rvol: Number(s.rvol),
    rank: s.rank,
    ema20: s.ema20 ? Number(s.ema20) : null,
    ema50: s.ema50 ? Number(s.ema50) : null,
    atr14: s.atr14 ? Number(s.atr14) : null,
    trend: s.trend,
    scannedAt: s.scannedAt,
  };
}

export default router;
