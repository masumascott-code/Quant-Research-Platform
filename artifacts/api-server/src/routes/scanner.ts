import { Router } from "express";
import { db } from "@workspace/db";
import {
  coinsTable,
  marketSnapshotsTable,
  signalsTable,
  paperTradesTable,
  scannerDecisionsTable,
  systemSettingsTable,
} from "@workspace/db";
import { eq, desc, sql, and, gte, count, sum, inArray } from "drizzle-orm";
import { configService } from "../core/config";
import { portfolioService } from "../core/portfolio";
import { ScannerService } from "../services/scanner";
import { SmcScannerService } from "../services/smc-scanner";
import { reconcileSignalStatuses } from "../services/signal-status";
import { logger } from "../lib/logger";

const router = Router();

router.get("/status", async (req, res) => {
  const scanner = ScannerService.getInstance();
  const status = scanner.getStatus();
  const config = await configService.get();

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
    maxOpenTrades: config.scanner.maxOpenTrades,
    maxDailyTrades: config.scanner.maxDailyTrades,
    maxWeeklyTrades: config.scanner.maxWeeklyTrades,
    scannerMode: config.scanner.mode,
    minScoreTrade: config.scanner.minScoreTrade,
    minScoreWatchlist: config.scanner.minScoreWatchlist,
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

router.get("/smc/status", async (req, res) => {
  const scanner = SmcScannerService.getInstance();
  const status = scanner.getStatus();
  res.json(status);
});

router.post("/smc/start", async (req, res) => {
  const scanner = SmcScannerService.getInstance();
  await scanner.start();
  const status = scanner.getStatus();
  res.json({
    success: status.running,
    message: status.running ? "SMC scanner started" : "SMC scanner is disabled",
    status,
  });
});

router.post("/smc/stop", async (req, res) => {
  const scanner = SmcScannerService.getInstance();
  scanner.stop();
  res.json({ success: true, message: "SMC scanner stopped" });
});

router.get("/smc/diagnostics", async (req, res) => {
  req.query.scannerType = "SMC_SCANNER";
  req.query.source = "SMC";
  const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 50);
  const from = new Date(Date.now() - parseWindowHours(req.query.hours, 24) * 60 * 60 * 1000);

  try {
    const decisions = await db
      .select()
      .from(scannerDecisionsTable)
      .where(scannerDecisionConditions("SMC", "SMC_SCANNER", from))
      .orderBy(desc(scannerDecisionsTable.createdAt))
      .limit(limit);

    res.json({
      diagnosticsAvailable: true,
      recentDecisions: decisions.map((decision) => formatDecision(decision, 0)),
    });
  } catch (err) {
    logger.warn({ err }, "SMC diagnostics unavailable");
    res.json({ diagnosticsAvailable: false, recentDecisions: [] });
  }
});

router.get("/gainers", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const gainers = await getLatestUniqueSnapshots("gainer", limit);
  res.json(await enrichSnapshotsWithDecisions(gainers, "LONG"));
});

router.get("/losers", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const losers = await getLatestUniqueSnapshots("loser", limit);
  res.json(await enrichSnapshotsWithDecisions(losers, "SHORT"));
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
  res.setHeader("Cache-Control", "no-store");

  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
  const scanner = ScannerService.getInstance();
  const status = scanner.getStatus();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const sizingSettings = await db
      .select({ updatedAt: systemSettingsTable.updatedAt })
      .from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, [
        "paperTrading.fixedTradeNotional",
        "fixed_trade_notional",
        "paperTrading.defaultLeverage",
        "default_leverage",
        "risk.riskPercent",
        "risk_pct",
      ]));
    const diagnosticsStart = latestDate([today, ...sizingSettings.map((setting) => setting.updatedAt)]);

    const decisionConditions = scannerDecisionConditions(req.query.source, req.query.scannerType, diagnosticsStart);

    const [recentDecisionCandidates, todayDecisions, recentSnapshotCandidates, scanActivity] = await Promise.all([
      db
        .select()
        .from(scannerDecisionsTable)
        .where(decisionConditions)
        .orderBy(desc(scannerDecisionsTable.createdAt))
        .limit(Math.max(limit * 20, 200)),
      db
        .select()
        .from(scannerDecisionsTable)
        .where(decisionConditions)
        .orderBy(desc(scannerDecisionsTable.createdAt)),
      db
        .select()
        .from(marketSnapshotsTable)
        .orderBy(desc(marketSnapshotsTable.scannedAt))
        .limit(Math.max(limit * 20, 200)),
      db
        .select({
          latestScanAt: sql<Date | null>`max(${marketSnapshotsTable.scannedAt})`,
          snapshotsLast10m: sql<number>`count(*) filter (where ${marketSnapshotsTable.scannedAt} >= now() - interval '10 minutes')::int`,
        })
        .from(marketSnapshotsTable),
    ]);

    const acceptedToday = todayDecisions.filter((decision) => displayDecision(decision) === "ACCEPTED").length;
    const rejectedToday = todayDecisions.filter((decision) => displayDecision(decision) === "REJECTED").length;
    const skippedToday = todayDecisions.filter((decision) => displayDecision(decision) === "SKIPPED").length;
    const averageFinalScore = average(todayDecisions.map((decision) => Number(decision.finalScore)));
    const averageConfidence = average(todayDecisions.map((decision) => Number(decision.confidence)));
    const todayCountsBySymbol = countBySymbol(todayDecisions);
    const recentDecisions = uniqueLatestBySymbol(recentDecisionCandidates).slice(0, limit);
    const partitionLimit = Math.max(6, Math.ceil(limit / 3));
    const formatPartition = (label: string) => recentDecisions
      .filter((decision) => displayDecision(decision) === label)
      .slice(0, partitionLimit)
      .map((decision) => formatDecision(decision, todayCountsBySymbol.get(decision.symbol) ?? 0));
    const topRejectedReasons = countValues(
      todayDecisions
        .filter((decision) => displayDecision(decision) === "REJECTED")
        .flatMap((decision) => asStringArray(decision.reasons))
    );

    res.json({
      running: status.running,
      lastScanAt: status.lastScanAt,
      nextScanIn: status.nextScanIn,
      diagnosticsAvailable: true,
      diagnosticsFrom: diagnosticsStart,
      scanActivity: {
        latestSnapshotAt: scanActivity[0]?.latestScanAt ?? null,
        snapshotsLast10m: Number(scanActivity[0]?.snapshotsLast10m ?? 0),
      },
      today: {
        totalDecisions: todayDecisions.length,
        accepted: acceptedToday,
        rejected: rejectedToday,
        skipped: skippedToday,
        averageFinalScore,
        averageConfidence,
        topRejectedReasons,
      },
      recentDecisions: recentDecisions.map((decision) => (
        formatDecision(decision, todayCountsBySymbol.get(decision.symbol) ?? 0)
      )),
      partitions: {
        accepted: formatPartition("ACCEPTED"),
        skipped: formatPartition("SKIPPED"),
        rejected: formatPartition("REJECTED"),
      },
      recentSnapshots: uniqueLatestBySymbol(recentSnapshotCandidates)
        .slice(0, limit)
        .map(formatSnapshot),
    });
  } catch (err) {
    logger.warn({ err }, "Scanner diagnostics decision store unavailable");
    res.json({
      running: status.running,
      lastScanAt: status.lastScanAt,
      nextScanIn: status.nextScanIn,
      diagnosticsAvailable: false,
      diagnosticsFrom: today,
      scanActivity: {
        latestSnapshotAt: null,
        snapshotsLast10m: 0,
      },
      today: emptyDiagnosticsSummary(),
      recentDecisions: [],
      recentSnapshots: [],
      message: "Scanner decision history is unavailable. Run database migrations to enable full diagnostics.",
    });
  }
});

router.get("/diagnostics/summary", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const hours = parseWindowHours(req.query.hours, 24);
  const from = new Date(Date.now() - hours * 60 * 60 * 1000);

  try {
    const decisions = await db
      .select()
      .from(scannerDecisionsTable)
      .where(scannerDecisionConditions(req.query.source, req.query.scannerType, from))
      .orderBy(desc(scannerDecisionsTable.createdAt));

    const accepted = decisions.filter((decision) => displayDecision(decision) === "ACCEPTED");
    const rejected = decisions.filter((decision) => displayDecision(decision) === "REJECTED");
    const skipped = decisions.filter((decision) => displayDecision(decision) === "SKIPPED");
    const longDecisions = decisions.filter((decision) => decision.direction === "LONG");
    const shortDecisions = decisions.filter((decision) => decision.direction === "SHORT");
    const shortProtectionDiagnostics = shortDecisions
      .map((decision) => shortProtectionFromDetails(decision.diagnosticDetails))
      .filter((diagnostic): diagnostic is Record<string, unknown> => !!diagnostic);

    res.json({
      diagnosticsAvailable: true,
      hours,
      from,
      totalDiagnostics: decisions.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      skippedCount: skipped.length,
      averageTechnicalScore: average(decisions.map((decision) => Number(decision.technicalScore))),
      averageFinalScore: average(decisions.map((decision) => Number(decision.finalScore))),
      rejectionStageBreakdown: countNamedValues(
        decisions
          .map((decision) => decision.rejectionStage)
          .filter((stage): stage is string => !!stage),
        "stage",
      ),
      rejectionReasonBreakdown: countNamedValues(
        decisions.flatMap((decision) => [
          ...(decision.rejectionReason ? [decision.rejectionReason] : []),
          ...asStringArray(decision.reasons),
        ]),
        "reason",
      ),
      directionCounts: {
        LONG: longDecisions.length,
        SHORT: shortDecisions.length,
      },
      longDiagnosticsCount: longDecisions.length,
      shortDiagnosticsCount: shortDecisions.length,
      shortWouldBlockCount: shortProtectionDiagnostics.filter((diagnostic) => diagnostic.shortProtectionWouldBlock === true).length,
      topShortProtectionReasons: countNamedValues(
        shortProtectionDiagnostics.flatMap((diagnostic) => asStringArray(diagnostic.shortProtectionReasons)),
        "reason",
      ),
      averageScoreByDirection: {
        LONG: averageScores(longDecisions),
        SHORT: averageScores(shortDecisions),
      },
      acceptedByDirection: {
        LONG: accepted.filter((decision) => decision.direction === "LONG").length,
        SHORT: accepted.filter((decision) => decision.direction === "SHORT").length,
      },
      rejectedByDirection: {
        LONG: rejected.filter((decision) => decision.direction === "LONG").length,
        SHORT: rejected.filter((decision) => decision.direction === "SHORT").length,
      },
    });
  } catch (err) {
    logger.warn({ err }, "Scanner diagnostics summary unavailable");
    res.json({
      diagnosticsAvailable: false,
      hours,
      from,
      totalDiagnostics: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      skippedCount: 0,
      averageTechnicalScore: 0,
      averageFinalScore: 0,
      rejectionStageBreakdown: [],
      rejectionReasonBreakdown: [],
      directionCounts: { LONG: 0, SHORT: 0 },
      longDiagnosticsCount: 0,
      shortDiagnosticsCount: 0,
      shortWouldBlockCount: 0,
      topShortProtectionReasons: [],
      averageScoreByDirection: {
        LONG: { technicalScore: 0, finalScore: 0 },
        SHORT: { technicalScore: 0, finalScore: 0 },
      },
      acceptedByDirection: { LONG: 0, SHORT: 0 },
      rejectedByDirection: { LONG: 0, SHORT: 0 },
      message: "Scanner decision history is unavailable. Run database migrations to enable diagnostics summaries.",
    });
  }
});

router.get("/dashboard", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  await reconcileSignalStatuses();

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
    listType: s.listType,
    ema20: s.ema20 ? Number(s.ema20) : null,
    ema50: s.ema50 ? Number(s.ema50) : null,
    atr14: s.atr14 ? Number(s.atr14) : null,
    trend: s.trend,
    scannedAt: s.scannedAt,
  };
}

async function enrichSnapshotsWithDecisions(
  snapshots: Array<typeof marketSnapshotsTable.$inferSelect>,
  direction: "LONG" | "SHORT"
) {
  if (snapshots.length === 0) return [];

  const symbols = snapshots.map((snapshot) => snapshot.symbol);
  const oldestSnapshotAt = snapshots.reduce(
    (oldest, snapshot) => snapshot.scannedAt < oldest ? snapshot.scannedAt : oldest,
    snapshots[0].scannedAt
  );
  const decisionCandidates = await db
    .select()
    .from(scannerDecisionsTable)
    .where(and(
      inArray(scannerDecisionsTable.symbol, symbols),
      eq(scannerDecisionsTable.direction, direction),
      gte(scannerDecisionsTable.createdAt, oldestSnapshotAt),
    ))
    .orderBy(desc(scannerDecisionsTable.createdAt));

  const latestDecisionBySymbol = new Map<string, typeof scannerDecisionsTable.$inferSelect>();
  for (const decision of decisionCandidates) {
    if (!latestDecisionBySymbol.has(decision.symbol)) {
      latestDecisionBySymbol.set(decision.symbol, decision);
    }
  }

  return snapshots.map((snapshot) => {
    const decision = latestDecisionBySymbol.get(snapshot.symbol);
    return {
      ...formatSnapshot(snapshot),
      latestDecision: decision
        ? {
          decision: displayDecision(decision),
          scoreAvailable: hasDecisionScore(decision),
          finalScore: Number(decision.finalScore),
          technicalScore: Number(decision.technicalScore),
          strategy: decision.strategy,
          reason: asStringArray(decision.reasons)[0] ?? null,
          createdAt: decision.createdAt,
        }
        : null,
    };
  });
}

function formatDecision(decision: typeof scannerDecisionsTable.$inferSelect, scansToday = 0) {
  const reasons = asStringArray(decision.reasons);
  const scoreDiagnostic = scoreDiagnosticFromDetails(decision.diagnosticDetails);
  const smcDiagnostic = smcDiagnosticFromDetails(decision.diagnosticDetails);

  return {
    id: decision.id,
    symbol: decision.symbol,
    direction: decision.direction,
    source: decision.source ?? "TECHNICAL",
    scannerType: decision.scannerType ?? "TECHNICAL_SCANNER",
    strategyType: decision.strategyType ?? "TECHNICAL",
    strategyLabel: decision.strategyLabel,
    badge: decision.badge,
    smcScore: decision.smcScore == null ? null : Number(decision.smcScore),
    smcDetails: decision.smcDetails ?? null,
    componentScores: decision.componentScores ?? null,
    diagnosticDetails: decision.diagnosticDetails ?? null,
    scannerMode: scoreDiagnostic.scannerMode,
    tradeGrade: scoreDiagnostic.tradeGrade,
    scoreDecision: scoreDiagnostic.scoreDecision,
    scoreDecisionReason: scoreDiagnostic.scoreDecisionReason,
    htfBias: smcDiagnostic.htfBias,
    liquiditySweep: smcDiagnostic.liquiditySweep,
    structure: smcDiagnostic.structure,
    fvg: smcDiagnostic.fvg,
    orderBlock: smcDiagnostic.orderBlock,
    premiumDiscount: smcDiagnostic.premiumDiscount,
    fibonacci: smcDiagnostic.fibonacci,
    riskReward: smcDiagnostic.riskReward,
    paperTradeOpened: smcDiagnostic.paperTradeOpened,
    paperTradeId: smcDiagnostic.paperTradeId,
    paperTradeBlockedReason: smcDiagnostic.paperTradeBlockedReason,
    rejectionStage: decision.rejectionStage,
    rejectionReason: decision.rejectionReason,
    blockedReason: decision.blockedReason,
    shortProtection: shortProtectionFromDetails(decision.diagnosticDetails),
    shortProtectionWouldBlock: shortProtectionFromDetails(decision.diagnosticDetails)?.shortProtectionWouldBlock ?? false,
    shortProtectionReasons: shortProtectionFromDetails(decision.diagnosticDetails)?.shortProtectionReasons ?? [],
    decision: displayDecision(decision),
    strategy: decision.strategy,
    finalScore: Number(decision.finalScore),
    technicalScore: Number(decision.technicalScore),
    confidence: Number(decision.confidence),
    marketRegime: decision.marketRegime,
    opportunityRank: decision.opportunityRank == null ? null : Number(decision.opportunityRank),
    riskGrade: decision.riskGrade,
    reasons,
    riskSummary: asStringArray(decision.riskSummary),
    scansToday,
    scoreAvailable: hasDecisionScore(decision),
    createdAt: decision.createdAt,
  };
}

function smcDiagnosticFromDetails(details: unknown) {
  if (!details || typeof details !== "object") {
    return {
      htfBias: null,
      liquiditySweep: null,
      structure: null,
      fvg: null,
      orderBlock: null,
      premiumDiscount: null,
      fibonacci: null,
      riskReward: null,
      paperTradeOpened: false,
      paperTradeId: null,
      paperTradeBlockedReason: null,
    };
  }

  const value = details as Record<string, unknown>;
  return {
    htfBias: typeof value.htfBias === "string" ? value.htfBias : null,
    liquiditySweep: typeof value.liquiditySweep === "string" ? value.liquiditySweep : null,
    structure: typeof value.structure === "string" ? value.structure : null,
    fvg: typeof value.fvg === "string" ? value.fvg : null,
    orderBlock: typeof value.orderBlock === "string" ? value.orderBlock : null,
    premiumDiscount: typeof value.premiumDiscount === "string" ? value.premiumDiscount : null,
    fibonacci: typeof value.fibonacci === "string" ? value.fibonacci : null,
    riskReward: typeof value.riskReward === "string" ? value.riskReward : null,
    paperTradeOpened: value.paperTradeOpened === true,
    paperTradeId: typeof value.paperTradeId === "string" ? value.paperTradeId : null,
    paperTradeBlockedReason: typeof value.paperTradeBlockedReason === "string" ? value.paperTradeBlockedReason : null,
  };
}

function scoreDiagnosticFromDetails(details: unknown) {
  if (!details || typeof details !== "object") {
    return {
      scannerMode: null,
      tradeGrade: null,
      scoreDecision: null,
      scoreDecisionReason: null,
    };
  }

  const value = details as {
    scannerMode?: unknown;
    tradeGrade?: unknown;
    scoreDecision?: unknown;
    scoreDecisionReason?: unknown;
  };

  return {
    scannerMode: typeof value.scannerMode === "string" ? value.scannerMode : null,
    tradeGrade: typeof value.tradeGrade === "string" ? value.tradeGrade : null,
    scoreDecision: typeof value.scoreDecision === "string" ? value.scoreDecision : null,
    scoreDecisionReason: typeof value.scoreDecisionReason === "string" ? value.scoreDecisionReason : null,
  };
}

function shortProtectionFromDetails(details: unknown): any | null {
  if (!details || typeof details !== "object") return null;
  const value = (details as { shortProtection?: unknown }).shortProtection;
  return value && typeof value === "object" ? value : null;
}

function scannerDecisionConditions(source: unknown, scannerType: unknown, from: Date) {
  const conditions = [gte(scannerDecisionsTable.createdAt, from)];
  if (source && ["TECHNICAL", "SMC"].includes(source as string)) {
    conditions.push(eq(scannerDecisionsTable.source, source as string));
  }
  if (scannerType && ["TECHNICAL_SCANNER", "SMC_SCANNER"].includes(scannerType as string)) {
    conditions.push(eq(scannerDecisionsTable.scannerType, scannerType as string));
  }
  return conditions.length > 1 ? and(...conditions) : conditions[0];
}

function hasDecisionScore(decision: typeof scannerDecisionsTable.$inferSelect): boolean {
  return Number(decision.finalScore) > 0 || Number(decision.technicalScore) > 0;
}

function displayDecision(decision: typeof scannerDecisionsTable.$inferSelect): string {
  const reasons = asStringArray(decision.reasons);
  if (decision.decision === "REJECTED" && isSkippedDecisionReason(reasons)) {
    return "SKIPPED";
  }

  return decision.decision;
}

function isSkippedDecisionReason(reasons: string[]): boolean {
  return reasons.some((reason) =>
    reason.includes("Duplicate open position exists") ||
    reason.includes("Duplicate active signal exists")
  );
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

function averageScores(decisions: Array<typeof scannerDecisionsTable.$inferSelect>) {
  return {
    technicalScore: average(decisions.map((decision) => Number(decision.technicalScore))),
    finalScore: average(decisions.map((decision) => Number(decision.finalScore))),
  };
}

function latestDate(values: Date[]): Date {
  return values.reduce((latest, value) => value > latest ? value : latest, values[0] ?? new Date());
}

function parseWindowHours(value: unknown, defaultHours: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultHours;
  return Math.min(Math.max(Math.floor(parsed), 1), 720);
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

function countNamedValues<TName extends string>(
  values: string[],
  name: TName,
  limit = 10,
): Array<Record<TName, string> & { count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ [name]: value, count }) as Record<TName, string> & { count: number });
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
