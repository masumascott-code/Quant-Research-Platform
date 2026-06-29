import { Router } from "express";
import { db } from "@workspace/db";
import {
  coinsTable,
  marketSnapshotsTable,
  signalsTable,
  paperTradesTable,
  scannerDecisionsTable,
} from "@workspace/db";
import { eq, desc, sql, and, gte, count, sum } from "drizzle-orm";
import { configService } from "../core/config";
import { portfolioService } from "../core/portfolio";
import { ScannerService } from "../services/scanner";
import { logger } from "../lib/logger";

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
  const gainers = await getLatestUniqueSnapshots("gainer", limit);
  res.json(gainers.map(formatSnapshot));
});

router.get("/losers", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const losers = await getLatestUniqueSnapshots("loser", limit);
  res.json(losers.map(formatSnapshot));
});

async function getLatestUniqueSnapshots(listType: "gainer" | "loser", limit: number) {
  const latestScan = await db.select({ maxId: sql<number>`max(id)` }).from(marketSnapshotsTable).where(eq(marketSnapshotsTable.listType, listType));

  if (!latestScan[0]?.maxId) {
    return [];
  }

  const latestScannedAt = await db
    .select({ scannedAt: marketSnapshotsTable.scannedAt })
    .from(marketSnapshotsTable)
    .where(eq(marketSnapshotsTable.id, latestScan[0].maxId));

  if (!latestScannedAt[0]) {
    return [];
  }

  const scanTime = latestScannedAt[0].scannedAt;
  const from = new Date(scanTime.getTime() - configService.getSync().scanner.snapshotFreshnessWindowMs);

  const candidates = await db
    .select()
    .from(marketSnapshotsTable)
    .where(and(eq(marketSnapshotsTable.listType, listType), gte(marketSnapshotsTable.scannedAt, from)))
    .orderBy(desc(marketSnapshotsTable.scannedAt))
    .limit(Math.max(limit * 20, 200));

  const latestBySymbol = new Map<string, (typeof candidates)[number]>();
  for (const snapshot of candidates) {
    if (!latestBySymbol.has(snapshot.symbol)) {
      latestBySymbol.set(snapshot.symbol, snapshot);
    }
  }

  return Array.from(latestBySymbol.values())
    .sort((a, b) => {
      const direction = listType === "gainer" ? -1 : 1;
      return direction * (Number(a.priceChangePercent) - Number(b.priceChangePercent));
    })
    .slice(0, limit);
}

router.get("/coins", async (req, res) => {
  const coins = await db.select().from(coinsTable).where(eq(coinsTable.isActive, true)).orderBy(coinsTable.symbol);
  res.json(coins.map(c => ({
    ...c,
    lastPrice: c.lastPrice ? Number(c.lastPrice) : null,
    volume24h: c.volume24h ? Number(c.volume24h) : null,
    priceChangePercent: c.priceChangePercent ? Number(c.priceChangePercent) : null,
  })));
});

router.get("/diagnostics", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
  const scanner = ScannerService.getInstance();
  const status = scanner.getStatus();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const [recentDecisionCandidates, todayDecisions] = await Promise.all([
      db
        .select()
        .from(scannerDecisionsTable)
        .orderBy(desc(scannerDecisionsTable.createdAt))
        .limit(Math.max(limit * 20, 200)),
      db
        .select()
        .from(scannerDecisionsTable)
        .where(gte(scannerDecisionsTable.createdAt, today))
        .orderBy(desc(scannerDecisionsTable.createdAt)),
    ]);

    const acceptedToday = todayDecisions.filter((decision) => decision.decision === "ACCEPTED").length;
    const rejectedToday = todayDecisions.filter((decision) => decision.decision === "REJECTED").length;
    const averageFinalScore = average(todayDecisions.map((decision) => Number(decision.finalScore)));
    const averageConfidence = average(todayDecisions.map((decision) => Number(decision.confidence)));
    const todayCountsBySymbol = countBySymbol(todayDecisions);
    const recentUniqueDecisions = uniqueLatestBySymbol(recentDecisionCandidates).slice(0, limit);
    const topRejectedReasons = countValues(
      todayDecisions
        .filter((decision) => decision.decision === "REJECTED")
        .flatMap((decision) => asStringArray(decision.reasons))
    );

    res.json({
      running: status.running,
      lastScanAt: status.lastScanAt,
      nextScanIn: status.nextScanIn,
      diagnosticsAvailable: true,
      today: {
        totalDecisions: todayDecisions.length,
        accepted: acceptedToday,
        rejected: rejectedToday,
        averageFinalScore,
        averageConfidence,
        topRejectedReasons,
      },
      recentDecisions: recentUniqueDecisions.map((decision) => (
        formatDecision(decision, todayCountsBySymbol.get(decision.symbol) ?? 0)
      )),
    });
  } catch (err) {
    logger.warn({ err }, "Scanner diagnostics decision store unavailable");
    res.json({
      running: status.running,
      lastScanAt: status.lastScanAt,
      nextScanIn: status.nextScanIn,
      diagnosticsAvailable: false,
      today: emptyDiagnosticsSummary(),
      recentDecisions: [],
      message: "Scanner decision history is unavailable. Run database migrations to enable full diagnostics.",
    });
  }
});

router.get("/dashboard", async (req, res) => {
  const scanner = ScannerService.getInstance();
  const status = scanner.getStatus();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalCoins, gainersCount, losersCount, activeSignals, openTrades, todayPerf, allTrades, portfolio] = await Promise.all([
    db.select({ count: count() }).from(coinsTable).where(eq(coinsTable.isActive, true)),
    db.select({ count: count() }).from(marketSnapshotsTable).where(eq(marketSnapshotsTable.listType, "gainer")),
    db.select({ count: count() }).from(marketSnapshotsTable).where(eq(marketSnapshotsTable.listType, "loser")),
    db.select({ count: count() }).from(signalsTable).where(eq(signalsTable.status, "active")),
    db.select({ count: count() }).from(paperTradesTable).where(eq(paperTradesTable.status, "open")),
    db.select({ pnl: sum(paperTradesTable.pnl) }).from(paperTradesTable).where(and(eq(paperTradesTable.status, "closed"), gte(paperTradesTable.closedAt, today))),
    db.select({ pnl: sum(paperTradesTable.pnl), wins: count() }).from(paperTradesTable).where(eq(paperTradesTable.status, "closed")),
    portfolioService.getSummary(),
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
    portfolio: {
      currency: portfolio.currency,
      equity: portfolio.equity,
      availableBalance: portfolio.availableBalance,
      usedMargin: portfolio.usedMargin,
      freeMargin: portfolio.freeMargin,
      openExposure: portfolio.openExposure,
      riskUsagePercent: portfolio.riskUsagePercent,
    },
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

function formatDecision(decision: typeof scannerDecisionsTable.$inferSelect, scansToday = 0) {
  return {
    id: decision.id,
    symbol: decision.symbol,
    direction: decision.direction,
    decision: decision.decision,
    strategy: decision.strategy,
    finalScore: Number(decision.finalScore),
    technicalScore: Number(decision.technicalScore),
    confidence: Number(decision.confidence),
    marketRegime: decision.marketRegime,
    opportunityRank: decision.opportunityRank == null ? null : Number(decision.opportunityRank),
    riskGrade: decision.riskGrade,
    reasons: asStringArray(decision.reasons),
    riskSummary: asStringArray(decision.riskSummary),
    scansToday,
    createdAt: decision.createdAt,
  };
}

function uniqueLatestBySymbol<T extends { symbol: string }>(rows: T[]): T[] {
  const latestBySymbol = new Map<string, T>();
  for (const row of rows) {
    if (!latestBySymbol.has(row.symbol)) {
      latestBySymbol.set(row.symbol, row);
    }
  }

  return [...latestBySymbol.values()];
}

function countBySymbol(rows: Array<{ symbol: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.symbol, (counts.get(row.symbol) ?? 0) + 1);
  }

  return counts;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function average(values: number[]): number {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) return 0;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function countValues(values: string[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));
}

function emptyDiagnosticsSummary() {
  return {
    totalDecisions: 0,
    accepted: 0,
    rejected: 0,
    averageFinalScore: 0,
    averageConfidence: 0,
    topRejectedReasons: [],
  };
}

export default router;
