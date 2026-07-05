import {
  useGetScannerDashboard,
  getGetScannerDashboardQueryKey,
  useGetOpenTrades,
  getGetOpenTradesQueryKey,
  useGetScannerStatus,
  getGetScannerStatusQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, TrendingUp, TrendingDown, Target, Briefcase, DollarSign, Zap, Shield, Wallet, Landmark, Radar, TimerReset } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useLivePrices } from "@/hooks/use-live-prices";
import { useEffect, useRef, useState } from "react";
import { isUnauthorizedError } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ScannerDiagnosticDecision = {
  id: number;
  symbol: string;
  direction: string;
  source?: string;
  scannerType?: string;
  badge?: string | null;
  strategyLabel?: string | null;
  smcScore?: number | null;
  decision: "ACCEPTED" | "REJECTED" | "SKIPPED" | string;
  strategy: string;
  finalScore: number;
  technicalScore: number;
  componentScores?: Record<string, number | null | undefined> | null;
  rejectionStage?: string | null;
  rejectionReason?: string | null;
  blockedReason?: string | null;
  shortProtectionWouldBlock?: boolean;
  shortProtectionReasons?: string[];
  htfBias?: string | null;
  liquiditySweep?: string | null;
  structure?: string | null;
  fvg?: string | null;
  orderBlock?: string | null;
  premiumDiscount?: string | null;
  fibonacci?: string | null;
  riskReward?: string | null;
  paperTradeOpened?: boolean;
  paperTradeId?: string | null;
  paperTradeBlockedReason?: string | null;
  confidence: number;
  marketRegime: string;
  opportunityRank: number | null;
  riskGrade: string;
  reasons: string[];
  riskSummary: string[];
  scansToday: number;
  scoreAvailable?: boolean;
  createdAt: string;
};

type ScannerDiagnosticSnapshot = {
  id: number;
  symbol: string;
  price: number;
  priceChangePercent: number;
  volume24h: number;
  rvol: number;
  rank: number;
  listType: "gainer" | "loser" | string;
  scannedAt: string;
};

type ScannerDiagnostics = {
  running: boolean;
  lastScanAt: string | null;
  nextScanIn: number | null;
  scanActivity?: {
    latestSnapshotAt: string | null;
    snapshotsLast10m: number;
  };
  diagnosticsAvailable?: boolean;
  message?: string;
  today: {
    totalDecisions: number;
    accepted: number;
    rejected: number;
    skipped: number;
    averageFinalScore: number;
    averageConfidence: number;
    topRejectedReasons: Array<{ reason: string; count: number }>;
  };
  recentDecisions: ScannerDiagnosticDecision[];
  partitions?: {
    accepted: ScannerDiagnosticDecision[];
    skipped: ScannerDiagnosticDecision[];
    rejected: ScannerDiagnosticDecision[];
  };
  recentSnapshots?: ScannerDiagnosticSnapshot[];
};

type ScannerDiagnosticsSummary = {
  diagnosticsAvailable?: boolean;
  totalDiagnostics: number;
  acceptedCount: number;
  rejectedCount: number;
  skippedCount: number;
  averageTechnicalScore: number;
  averageFinalScore: number;
  shortWouldBlockCount: number;
  topShortProtectionReasons: Array<{ reason: string; count: number }>;
  averageScoreByDirection: {
    LONG: { technicalScore: number; finalScore: number };
    SHORT: { technicalScore: number; finalScore: number };
  };
  acceptedByDirection: { LONG: number; SHORT: number };
  rejectedByDirection: { LONG: number; SHORT: number };
};

type DirectionPerformanceSummary = {
  closedLongTradeCount: number;
  closedShortTradeCount: number;
  longWinRate: number;
  shortWinRate: number;
  averageLongPnl: number;
  averageShortPnl: number;
  averageLongScore: number;
  averageShortScore: number;
  averageLongDurationMinutes: number;
  averageShortDurationMinutes: number;
  bestSymbols: Array<{ symbol: string; direction: string; totalPnl: number; count: number }>;
  worstSymbols: Array<{ symbol: string; direction: string; totalPnl: number; count: number }>;
};

type ScannerSourceSummary = {
  closedTradeCount: number;
  winRate: number;
  totalPnl: number;
  averagePnl: number;
  averageScore: number;
  longWinRate?: number;
  shortWinRate?: number;
  bestSymbols?: Array<{ symbol: string; direction: string; totalPnl: number; count: number }>;
  worstSymbols?: Array<{ symbol: string; direction: string; totalPnl: number; count: number }>;
};

type ScannerComparisonSummary = {
  technical: ScannerSourceSummary;
  smc: ScannerSourceSummary;
};

export default function Dashboard() {
  const { data: dashboard, isLoading, isError: dashboardError, error: dashboardQueryError } = useGetScannerDashboard({
    query: {
      queryKey: getGetScannerDashboardQueryKey(),
      refetchInterval: 15000
    }
  });

  const { data: openTrades } = useGetOpenTrades({
    query: {
      queryKey: getGetOpenTradesQueryKey(),
      refetchInterval: 20000
    }
  });

  const { data: scannerStatus, isError: scannerStatusError, error: scannerStatusQueryError } = useGetScannerStatus({
    query: {
      queryKey: getGetScannerStatusQueryKey(),
      refetchInterval: 15000
    }
  });

  const livePrices = useLivePrices();
  const scannerAuthError = isUnauthorizedError(dashboardQueryError) || isUnauthorizedError(scannerStatusQueryError);
  const scannerUnavailable = dashboardError || scannerStatusError;
  const scannerLimits = scannerStatus as typeof scannerStatus & {
    maxDailyTrades?: number;
    maxWeeklyTrades?: number;
  };
  const maxDailyTrades = scannerLimits?.maxDailyTrades ?? 5;
  const maxWeeklyTrades = scannerLimits?.maxWeeklyTrades ?? 15;
  const scannerStatusLabel = scannerAuthError
    ? "Authentication Required"
    : scannerUnavailable
      ? "Unable to retrieve scanner status"
      : dashboard?.scannerRunning
        ? "ACTIVE"
        : "STOPPED";
  const scannerStatusOk = !scannerUnavailable && !!dashboard?.scannerRunning;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">System Dashboard</h1>
        <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-mono text-muted-foreground sm:w-auto sm:gap-4">
          <span>Last Scan: {dashboard?.lastScanAt ? new Date(dashboard.lastScanAt).toLocaleTimeString() : '---'}</span>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <span className="flex items-center gap-2">
            Status:
            {isLoading ? (
              <span className="text-muted-foreground">LOADING</span>
            ) : scannerUnavailable ? (
              <span className={scannerAuthError ? "text-yellow-400" : "text-muted-foreground"}>
                {scannerStatusLabel}
              </span>
            ) : dashboard?.scannerRunning ? (
              <span className="text-success flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                ACTIVE
              </span>
            ) : (
              <span className="text-destructive flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                STOPPED
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Paper Equity" value={formatCurrency(dashboard?.portfolio?.equity, dashboard?.portfolio?.currency)} icon={Wallet} loading={isLoading} />
        <StatCard title="Available Balance" value={formatCurrency(dashboard?.portfolio?.availableBalance, dashboard?.portfolio?.currency)} icon={Landmark} loading={isLoading} />
        <StatCard title="Used Margin" value={formatCurrency(dashboard?.portfolio?.usedMargin, dashboard?.portfolio?.currency)} icon={Shield} loading={isLoading} />
        <StatCard title="Daily PnL" value={dashboard?.todayPnl != null ? `$${dashboard.todayPnl.toFixed(2)}` : '---'} icon={DollarSign} valueColor={dashboard && dashboard.todayPnl > 0 ? "text-success" : dashboard && dashboard.todayPnl < 0 ? "text-destructive" : ""} loading={isLoading} />
        <StatCard title="Total PnL" value={dashboard?.totalPnl != null ? `$${dashboard.totalPnl.toFixed(2)}` : '---'} icon={Activity} valueColor={dashboard && dashboard.totalPnl > 0 ? "text-success" : dashboard && dashboard.totalPnl < 0 ? "text-destructive" : ""} loading={isLoading} />
        <StatCard title="Win Rate" value={dashboard?.winRate != null ? `${(dashboard.winRate * 100).toFixed(1)}%` : '---'} icon={Target} loading={isLoading} />
        <StatCard title="Open Trades" value={dashboard?.openTrades?.toString() || '0'} icon={Briefcase} loading={isLoading} />
        <StatCard title="Active Signals" value={dashboard?.activeSignals?.toString() || '0'} icon={Activity} loading={isLoading} />
        <StatCard title="Total Coins Tracked" value={dashboard?.totalCoins?.toString() || '0'} icon={TrendingUp} loading={isLoading} />
        <StatCard title="Top Gainers" value={dashboard?.topGainersCount?.toString() || '0'} icon={TrendingUp} valueColor="text-success" loading={isLoading} />
        <StatCard title="Top Losers" value={dashboard?.topLosersCount?.toString() || '0'} icon={TrendingDown} valueColor="text-destructive" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Positions Ticker */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Live Positions
              {Object.keys(livePrices).length > 0 && (
                <span className="ml-auto flex items-center gap-1 text-success text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  LIVE
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!openTrades || openTrades.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center font-mono text-sm text-muted-foreground border border-dashed border-border rounded">
                NO OPEN POSITIONS
              </div>
            ) : (
              <div className="space-y-3">
                {openTrades.map((trade) => (
                  <LivePositionCard key={trade.id} trade={trade} livePrices={livePrices} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase">System Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <StatusRow label="Scanner Engine" status={scannerStatusLabel} ok={scannerStatusOk} />
            <StatusRow label="Live Price Feed" status={Object.keys(livePrices).length > 0 ? "CONNECTED" : "AWAITING"} ok={Object.keys(livePrices).length > 0} />
            <StatusRow label="Database" status="CONNECTED" ok={true} />
            <StatusRow label="Binance API" status={dashboard?.lastScanAt ? "REACHABLE" : "---"} ok={!!dashboard?.lastScanAt} />
            <div className="pt-2 border-t border-border">
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Today's Trades</span>
                <span>{scannerStatus?.dailyTrades ?? 0} / {maxDailyTrades}</span>
              </div>
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(((scannerStatus?.dailyTrades ?? 0) / maxDailyTrades) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Weekly Trades</span>
                <span>{scannerStatus?.weeklyTrades ?? 0} / {maxWeeklyTrades}</span>
              </div>
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(((scannerStatus?.weeklyTrades ?? 0) / maxWeeklyTrades) * 100, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <StabilizationSummaryPanel />
      <ScannerDiagnosticsPanel />
      <SmcDiagnosticsPanel />
    </div>
  );
}

function formatCurrency(value?: number, currency = "USDT"): string {
  return value == null ? "---" : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function LivePositionCard({ trade, livePrices }: { trade: any; livePrices: Record<string, any> }) {
  const liveData = livePrices[trade.symbol];
  const markPrice = liveData?.price ?? null;
  const prevRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (markPrice == null) return undefined;
    if (prevRef.current != null && markPrice !== prevRef.current) {
      setFlash(markPrice > prevRef.current ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 600);
      prevRef.current = markPrice;
      return () => clearTimeout(t);
    }
    prevRef.current = markPrice;
    return undefined;
  }, [markPrice]);

  const entry = Number(trade.entryPrice);
  const qty = Number(trade.quantity);
  const livePnl = markPrice != null
    ? (trade.direction === "LONG" ? (markPrice - entry) * qty : (entry - markPrice) * qty)
    : null;
  const livePnlPct = markPrice != null
    ? (trade.direction === "LONG" ? ((markPrice - entry) / entry) * 100 : ((entry - markPrice) / entry) * 100)
    : null;

  return (
    <div className={`rounded-md border border-border px-3 py-2.5 transition-colors duration-300 ${flash === "up" ? "bg-success/10" : flash === "down" ? "bg-destructive/10" : "bg-muted/20"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm">{trade.symbol}</span>
          <Badge variant="outline" className={`text-xs font-mono ${trade.direction === "LONG" ? "text-success border-success/30" : "text-destructive border-destructive/30"}`}>
            {trade.direction}
          </Badge>
          <SourceBadge item={trade} />
          <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
            {trade.signalGrade}
          </span>
        </div>
        <div className="text-right">
          {livePnl != null ? (
            <div>
              <span className={`font-mono font-bold text-sm ${livePnl > 0 ? "text-success" : livePnl < 0 ? "text-destructive" : ""}`}>
                {livePnl > 0 ? "+" : ""}{livePnl.toFixed(4)}
              </span>
              <span className={`ml-1.5 text-xs font-mono ${livePnlPct! > 0 ? "text-success" : livePnlPct! < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                ({livePnlPct! > 0 ? "+" : ""}{livePnlPct!.toFixed(2)}%)
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground font-mono text-sm animate-pulse">···</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5 text-xs font-mono text-muted-foreground">
        <span>Entry {entry.toFixed(4)}</span>
        {markPrice != null && (
          <span className={flash === "up" ? "text-success" : flash === "down" ? "text-destructive" : "text-foreground"}>
            Mark {markPrice.toFixed(4)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Shield className="h-2.5 w-2.5" />
          SL {Number(trade.currentSl || trade.stopLoss).toFixed(4)}
        </span>
      </div>
      {/* Distance bars to TP targets */}
      {markPrice != null && (
        <div className="flex gap-1 mt-2">
          {[
            { price: trade.tp1, hit: trade.tp1Hit, label: "T1" },
            { price: trade.tp2, hit: trade.tp2Hit, label: "T2" },
            { price: trade.tp3, hit: trade.tp3Hit, label: "T3" },
          ].map(({ price, hit, label }) => {
            const pct = Math.min(
              Math.max(
                trade.direction === "LONG"
                  ? ((markPrice - entry) / (price - entry)) * 100
                  : ((entry - markPrice) / (entry - price)) * 100,
                0
              ),
              100
            );
            return (
              <div key={label} className="flex-1">
                <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
                  <span>{label}</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${hit ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SmcDiagnosticsPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["smc-diagnostics", { limit: 12 }],
    queryFn: () => apiFetch<{ diagnosticsAvailable: boolean; recentDecisions: ScannerDiagnosticDecision[] }>("/api/scanner/smc/diagnostics?limit=12"),
    refetchInterval: 10000,
  });

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-sm font-mono text-muted-foreground uppercase flex items-center gap-2">
          <Radar className="h-4 w-4 text-cyan-300" />
          SMC Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <div className="flex h-[180px] items-center justify-center font-mono text-sm text-muted-foreground">SMC DIAGNOSTICS UNAVAILABLE</div>
        ) : isLoading ? (
          <div className="grid gap-px bg-border/60 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-none" />)}
          </div>
        ) : !data?.recentDecisions.length ? (
          <div className="flex h-[180px] items-center justify-center font-mono text-sm text-muted-foreground">NO SMC DECISIONS YET</div>
        ) : (
          <div className="grid gap-px bg-border/60 md:grid-cols-3">
            {data.recentDecisions.slice(0, 6).map((decision) => (
              <div key={decision.id} className="bg-card p-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-bold">{decision.symbol}</div>
                    <div className={decision.direction === "LONG" ? "font-mono text-success" : "font-mono text-destructive"}>{decision.direction}</div>
                  </div>
                  <Badge variant="outline" className={decision.decision === "ACCEPTED" ? "border-success/40 text-success" : decision.decision === "SKIPPED" ? "border-yellow-500/40 text-yellow-400" : "text-muted-foreground"}>
                    {decision.decision}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-muted-foreground">
                  <span>SMC Score</span><span className="text-right text-foreground">{decision.smcScore ?? decision.finalScore}</span>
                  <span>HTF</span><span className="text-right text-foreground">{decision.htfBias ?? "---"}</span>
                  <span>Sweep</span><span className="truncate text-right text-foreground">{decision.liquiditySweep ?? "---"}</span>
                  <span>Structure</span><span className="truncate text-right text-foreground">{decision.structure ?? "---"}</span>
                  <span>FVG</span><span className="truncate text-right text-foreground">{decision.fvg ?? "---"}</span>
                  <span>OB</span><span className="truncate text-right text-foreground">{decision.orderBlock ?? "---"}</span>
                  <span>Fib/PD</span><span className="truncate text-right text-foreground">{decision.fibonacci ?? decision.premiumDiscount ?? "---"}</span>
                  <span>RR</span><span className="text-right text-foreground">{decision.riskReward ?? "---"}</span>
                </div>
                <div className="mt-2 rounded border border-border bg-muted/20 p-2 font-mono text-[10px] text-muted-foreground">
                  Paper trade: {decision.paperTradeOpened ? `OPENED ${decision.paperTradeId ?? ""}` : decision.paperTradeBlockedReason ?? "not opened"}
                </div>
                <p className="mt-2 line-clamp-2 text-muted-foreground">{decision.rejectionReason ?? decision.reasons?.[0] ?? decision.strategyLabel ?? "SMC decision"}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SourceBadge({ item }: { item: any }) {
  const isSmc = item.source === "SMC" || item.scannerType === "SMC_SCANNER";
  return (
    <Badge variant="outline" className={`font-mono text-[10px] ${isSmc ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300" : "border-muted-foreground/30 text-muted-foreground"}`}>
      {isSmc ? item.badge ?? "SMC" : "TECH"}
    </Badge>
  );
}

function ScannerDiagnosticsPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["scanner-diagnostics", { limit: 24 }],
    queryFn: () => apiFetch<ScannerDiagnostics>("/api/scanner/diagnostics?limit=24"),
    refetchInterval: 5000,
  });
  const [displayNextScan, setDisplayNextScan] = useState<number | null>(null);

  const latestDecision = data?.recentDecisions[0];
  const latestSnapshot = data?.recentSnapshots?.[0];
  const partitions = data?.partitions ?? {
    accepted: data?.recentDecisions.filter((decision) => decision.decision === "ACCEPTED") ?? [],
    skipped: data?.recentDecisions.filter((decision) => decision.decision === "SKIPPED") ?? [],
    rejected: data?.recentDecisions.filter((decision) => decision.decision === "REJECTED") ?? [],
  };
  const showScanActivity = !isLoading && (data?.today.totalDecisions ?? 0) === 0 && !!latestSnapshot;
  const latestReason = latestDecision?.reasons[0] ?? latestDecision?.riskSummary[0] ?? "---";
  const latestDisplayReason = latestDecision?.blockedReason
    ?? latestDecision?.rejectionReason
    ?? latestReason;

  useEffect(() => {
    if (data?.nextScanIn == null) {
      setDisplayNextScan(null);
      return undefined;
    }

    setDisplayNextScan(data.nextScanIn);
    const timer = window.setInterval(() => {
      setDisplayNextScan((value) => value == null ? null : Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [data?.lastScanAt, data?.nextScanIn]);

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-sm font-mono text-muted-foreground uppercase flex items-center gap-2">
          <Radar className="h-4 w-4 text-primary" />
          Scanner Diagnostics
          {data?.running && (
            <span className="ml-auto flex items-center gap-1 text-success text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              LIVE
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <div className="h-[220px] flex items-center justify-center font-mono text-sm text-muted-foreground">
            DIAGNOSTICS UNAVAILABLE
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-border/60">
              <DiagnosticStat label="Decisions Today" value={data?.today.totalDecisions.toString() ?? "---"} loading={isLoading} />
              <DiagnosticStat label="Accepted" value={data?.today.accepted.toString() ?? "---"} valueClassName="text-success" loading={isLoading} />
              <DiagnosticStat label="Rejected" value={data?.today.rejected.toString() ?? "---"} valueClassName="text-destructive" loading={isLoading} />
              <DiagnosticStat label="Skipped" value={data?.today.skipped?.toString() ?? "0"} valueClassName="text-yellow-400" loading={isLoading} />
              <DiagnosticStat label="Avg Score" value={formatScore(data?.today.averageFinalScore)} loading={isLoading} />
              <DiagnosticStat label="Next Scan" value={displayNextScan == null ? "---" : `${displayNextScan}s`} loading={isLoading} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0">
              <div className="min-w-0 p-4">
                {isLoading ? (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-56 w-full" />
                    ))}
                  </div>
                ) : data?.diagnosticsAvailable === false ? (
                  <div className="flex h-56 items-center justify-center text-muted-foreground font-mono text-sm">
                    DECISION HISTORY UNAVAILABLE
                  </div>
                ) : showScanActivity ? (
                  <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="font-mono text-xs text-muted-foreground">TIME</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground">SYMBOL</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground">DECISION</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground text-right">
                        {showScanActivity ? "CHANGE" : "SCORE"}
                      </TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground">REASON</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.recentSnapshots?.map((snapshot) => (
                        <TableRow key={snapshot.id} className="border-border hover:bg-muted/50">
                          <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(snapshot.scannedAt)}
                          </TableCell>
                          <TableCell className="font-mono font-bold whitespace-nowrap">
                            <span>{snapshot.symbol}</span>
                            <span className={`ml-2 text-xs ${snapshot.listType === "gainer" ? "text-success" : "text-destructive"}`}>
                              {snapshot.listType.toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-muted-foreground">
                              SCANNED
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {snapshot.priceChangePercent.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[360px]">
                            <span className="line-clamp-1">
                              Rank #{snapshot.rank} at {formatPrice(snapshot.price)} with {formatVolume(snapshot.volume24h)} 24h volume
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <DecisionPartition title="Accepted" decisions={partitions.accepted} accentClassName="text-success" />
                    <DecisionPartition title="Skipped" decisions={partitions.skipped} accentClassName="text-yellow-400" />
                    <DecisionPartition title="Rejected" decisions={partitions.rejected} accentClassName="text-destructive" />
                  </div>
                )}
              </div>

              <div className="border-t lg:border-t-0 lg:border-l border-border p-4 space-y-4">
                <div>
                  <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground uppercase">
                    <TimerReset className="h-3.5 w-3.5" />
                    Latest Scan Readout
                  </div>
                  <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold">{showScanActivity ? latestSnapshot?.symbol : latestDecision?.symbol ?? "---"}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {showScanActivity ? formatTime(latestSnapshot?.scannedAt) : latestDecision ? formatTime(latestDecision.createdAt) : "---"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                      <span className="text-muted-foreground">{showScanActivity ? "Mode" : "Strategy"}</span>
                      <span className="text-right">{showScanActivity ? "Market Scan" : latestDecision?.strategy ?? "---"}</span>
                      <span className="text-muted-foreground">{showScanActivity ? "List" : "Regime"}</span>
                      <span className="text-right">{showScanActivity ? latestSnapshot?.listType.toUpperCase() : latestDecision?.marketRegime ?? "---"}</span>
                      <span className="text-muted-foreground">{showScanActivity ? "Change" : "Confidence"}</span>
                      <span className="text-right">{showScanActivity ? `${formatScore(latestSnapshot?.priceChangePercent)}%` : formatScore(latestDecision?.confidence)}</span>
                      <span className="text-muted-foreground">{showScanActivity ? "Rank" : "Risk Grade"}</span>
                      <span className="text-right">{showScanActivity ? `Rank #${latestSnapshot?.rank ?? "---"}` : latestDecision?.riskGrade ?? "---"}</span>
                      {!showScanActivity && (
                        <>
                          <span className="text-muted-foreground">Tech / Final</span>
                          <span className="text-right">{formatScore(latestDecision?.technicalScore)} / {formatScore(latestDecision?.finalScore)}</span>
                          <span className="text-muted-foreground">Stage</span>
                          <span className="text-right">{latestDecision?.rejectionStage ?? "---"}</span>
                        </>
                      )}
                    </div>
                    {!showScanActivity && latestDecision?.componentScores && (
                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-xs font-mono">
                        {Object.entries(latestDecision.componentScores)
                          .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
                          .slice(0, 8)
                          .map(([key, value]) => (
                            <div key={key} className="flex justify-between gap-2">
                              <span className="truncate text-muted-foreground">{scoreLabel(key)}</span>
                              <span>{formatScore(value ?? undefined)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                    {!showScanActivity && latestDecision?.shortProtectionWouldBlock && (
                      <div className="mt-3 rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-300">
                        SHORT protection would block: {latestDecision.shortProtectionReasons?.[0] ?? "review required"}
                      </div>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                      {data?.message ?? (showScanActivity && latestSnapshot
                        ? `Latest market scan snapshot recorded ${data?.scanActivity?.snapshotsLast10m ?? 0} snapshots in the last 10 minutes.`
                        : latestDisplayReason)}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="font-mono text-xs text-muted-foreground uppercase">Current Reject Reasons</div>
                  <div className="mt-2 space-y-2">
                    {data?.today.topRejectedReasons.length ? (
                      data.today.topRejectedReasons.map((item) => (
                        <div key={item.reason} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-muted-foreground line-clamp-1">{item.reason}</span>
                          <span className="font-mono text-destructive">{item.count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground">No rejected decisions in the current window.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StabilizationSummaryPanel() {
  const { data: diagnosticsSummary, isLoading: diagnosticsLoading } = useQuery({
    queryKey: ["scanner-diagnostics-summary", { hours: 24 }],
    queryFn: () => apiFetch<ScannerDiagnosticsSummary>("/api/scanner/diagnostics/summary?hours=24"),
    refetchInterval: 15000,
  });

  const { data: directionPerformance, isLoading: performanceLoading } = useQuery({
    queryKey: ["direction-performance", { days: 90 }],
    queryFn: () => apiFetch<DirectionPerformanceSummary>("/api/analytics/direction-performance?days=90"),
    refetchInterval: 30000,
  });

  const { data: scannerComparison, isLoading: comparisonLoading } = useQuery({
    queryKey: ["scanner-comparison"],
    queryFn: () => apiFetch<ScannerComparisonSummary>("/api/analytics/scanner-comparison"),
    refetchInterval: 30000,
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <Card className="border-border bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono text-muted-foreground uppercase flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" />
            Diagnostics Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniSummaryStat label="Total" value={diagnosticsSummary?.totalDiagnostics.toString() ?? "---"} loading={diagnosticsLoading} />
            <MiniSummaryStat label="Accepted" value={diagnosticsSummary?.acceptedCount.toString() ?? "---"} loading={diagnosticsLoading} valueClassName="text-success" />
            <MiniSummaryStat label="Rejected" value={diagnosticsSummary?.rejectedCount.toString() ?? "---"} loading={diagnosticsLoading} valueClassName="text-destructive" />
            <MiniSummaryStat label="Short Would Block" value={diagnosticsSummary?.shortWouldBlockCount.toString() ?? "---"} loading={diagnosticsLoading} valueClassName="text-yellow-400" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <DirectionScoreReadout label="LONG" scores={diagnosticsSummary?.averageScoreByDirection.LONG} accepted={diagnosticsSummary?.acceptedByDirection.LONG} rejected={diagnosticsSummary?.rejectedByDirection.LONG} />
            <DirectionScoreReadout label="SHORT" scores={diagnosticsSummary?.averageScoreByDirection.SHORT} accepted={diagnosticsSummary?.acceptedByDirection.SHORT} rejected={diagnosticsSummary?.rejectedByDirection.SHORT} />
          </div>
          <div>
            <div className="font-mono text-xs text-muted-foreground uppercase">Top Short Protection Reasons</div>
            <div className="mt-2 space-y-2">
              {diagnosticsSummary?.topShortProtectionReasons.length ? (
                diagnosticsSummary.topShortProtectionReasons.slice(0, 4).map((item) => (
                  <div key={item.reason} className="flex items-center justify-between gap-3 text-xs">
                    <span className="line-clamp-1 text-muted-foreground">{item.reason}</span>
                    <span className="font-mono text-yellow-400">{item.count}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">No SHORT protection flags in this window.</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono text-muted-foreground uppercase flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            LONG vs SHORT Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PerformanceDirectionCard
              label="LONG"
              count={directionPerformance?.closedLongTradeCount}
              winRate={directionPerformance?.longWinRate}
              averagePnl={directionPerformance?.averageLongPnl}
              averageScore={directionPerformance?.averageLongScore}
              averageDuration={directionPerformance?.averageLongDurationMinutes}
              loading={performanceLoading}
            />
            <PerformanceDirectionCard
              label="SHORT"
              count={directionPerformance?.closedShortTradeCount}
              winRate={directionPerformance?.shortWinRate}
              averagePnl={directionPerformance?.averageShortPnl}
              averageScore={directionPerformance?.averageShortScore}
              averageDuration={directionPerformance?.averageShortDurationMinutes}
              loading={performanceLoading}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ScannerSourceCard label="Technical Scanner" summary={scannerComparison?.technical} loading={comparisonLoading} />
            <ScannerSourceCard label="SMC Scanner" summary={scannerComparison?.smc} loading={comparisonLoading} accentClassName="text-cyan-300" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <SymbolList title="SMC Best Symbols" items={scannerComparison?.smc.bestSymbols ?? []} />
            <SymbolList title="SMC Worst Symbols" items={scannerComparison?.smc.worstSymbols ?? []} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScannerSourceCard({
  label,
  summary,
  loading,
  accentClassName = "text-primary",
}: {
  label: string;
  summary?: ScannerSourceSummary;
  loading: boolean;
  accentClassName?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs">
      <div className={accentClassName}>{label}</div>
      {loading ? (
        <Skeleton className="mt-3 h-20 w-full" />
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
          <span>Closed</span>
          <span className="text-right text-foreground">{summary?.closedTradeCount ?? 0}</span>
          <span>Win Rate</span>
          <span className="text-right text-foreground">{formatPercent(summary?.winRate)}</span>
          <span>Total PnL</span>
          <span className={`text-right ${(summary?.totalPnl ?? 0) > 0 ? "text-success" : (summary?.totalPnl ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>
            {formatCurrencyValue(summary?.totalPnl)}
          </span>
          <span>Avg PnL</span>
          <span className="text-right text-foreground">{formatCurrencyValue(summary?.averagePnl)}</span>
          {summary?.longWinRate != null && (
            <>
              <span>LONG WR</span>
              <span className="text-right text-success">{formatPercent(summary.longWinRate)}</span>
              <span>SHORT WR</span>
              <span className="text-right text-destructive">{formatPercent(summary.shortWinRate)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MiniSummaryStat({
  label,
  value,
  valueClassName = "",
  loading,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="text-[10px] uppercase text-muted-foreground font-mono">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-5 w-14" />
      ) : (
        <div className={`mt-1 font-mono text-lg font-bold ${valueClassName}`}>{value}</div>
      )}
    </div>
  );
}

function DirectionScoreReadout({
  label,
  scores,
  accepted,
  rejected,
}: {
  label: "LONG" | "SHORT";
  scores?: { technicalScore: number; finalScore: number };
  accepted?: number;
  rejected?: number;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className={label === "LONG" ? "text-success" : "text-destructive"}>{label}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
        <span>Tech</span>
        <span className="text-right text-foreground">{formatScore(scores?.technicalScore)}</span>
        <span>Final</span>
        <span className="text-right text-foreground">{formatScore(scores?.finalScore)}</span>
        <span>Accepted</span>
        <span className="text-right text-success">{accepted ?? 0}</span>
        <span>Rejected</span>
        <span className="text-right text-destructive">{rejected ?? 0}</span>
      </div>
    </div>
  );
}

function PerformanceDirectionCard({
  label,
  count,
  winRate,
  averagePnl,
  averageScore,
  averageDuration,
  loading,
}: {
  label: "LONG" | "SHORT";
  count?: number;
  winRate?: number;
  averagePnl?: number;
  averageScore?: number;
  averageDuration?: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs">
      <div className={label === "LONG" ? "text-success" : "text-destructive"}>{label}</div>
      {loading ? (
        <Skeleton className="mt-3 h-20 w-full" />
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
          <span>Closed</span>
          <span className="text-right text-foreground">{count ?? 0}</span>
          <span>Win Rate</span>
          <span className="text-right text-foreground">{formatPercent(winRate)}</span>
          <span>Avg PnL</span>
          <span className={`text-right ${(averagePnl ?? 0) > 0 ? "text-success" : (averagePnl ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>
            {formatCurrencyValue(averagePnl)}
          </span>
          <span>Avg Score</span>
          <span className="text-right text-foreground">{formatScore(averageScore)}</span>
          <span>Avg Duration</span>
          <span className="text-right text-foreground">{formatDuration(averageDuration)}</span>
        </div>
      )}
    </div>
  );
}

function SymbolList({
  title,
  items,
}: {
  title: string;
  items: Array<{ symbol: string; direction: string; totalPnl: number; count: number }>;
}) {
  return (
    <div>
      <div className="font-mono text-xs text-muted-foreground uppercase">{title}</div>
      <div className="mt-2 space-y-2">
        {items.length ? (
          items.slice(0, 4).map((item) => (
            <div key={`${title}-${item.direction}-${item.symbol}`} className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                {item.symbol} <span className={item.direction === "LONG" ? "text-success" : "text-destructive"}>{item.direction}</span>
              </span>
              <span className="font-mono text-xs text-foreground">{formatCurrencyValue(item.totalPnl)} / {item.count}</span>
            </div>
          ))
        ) : (
          <div className="text-xs text-muted-foreground">No closed trades in this window.</div>
        )}
      </div>
    </div>
  );
}

function DiagnosticStat({
  label,
  value,
  valueClassName = "",
  loading,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  loading: boolean;
}) {
  return (
    <div className="bg-card p-4 min-h-[82px]">
      <div className="text-[10px] uppercase text-muted-foreground font-mono">{label}</div>
      {loading ? (
        <Skeleton className="mt-3 h-6 w-16" />
      ) : (
        <div className={`mt-2 font-mono text-xl font-bold ${valueClassName}`}>{value}</div>
      )}
    </div>
  );
}

function DecisionPartition({
  title,
  decisions,
  accentClassName,
}: {
  title: string;
  decisions: ScannerDiagnosticDecision[];
  accentClassName: string;
}) {
  return (
    <div className="min-h-[260px] rounded-md border border-border bg-muted/10">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className={`font-mono text-xs uppercase ${accentClassName}`}>{title}</span>
        <span className="font-mono text-xs text-muted-foreground">{decisions.length}</span>
      </div>
      {decisions.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-xs font-mono text-muted-foreground">
          NO RECENT {title.toUpperCase()}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {decisions.map((decision) => (
            <div key={decision.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-sm font-bold">{decision.symbol}</span>
                  <span className={`ml-2 text-xs ${decision.direction === "LONG" ? "text-success" : "text-destructive"}`}>
                    {decision.direction}
                  </span>
                  {decision.scansToday > 1 && (
                    <span className="ml-2 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      x{decision.scansToday}
                    </span>
                  )}
                </div>
                <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {formatTime(decision.createdAt)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                <span className="line-clamp-1 text-muted-foreground">
                  {decision.blockedReason ?? decision.rejectionReason ?? decision.reasons[0] ?? decision.riskSummary[0] ?? "---"}
                </span>
                <span className="font-mono text-foreground">{formatDecisionScore(decision)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <span>TECH {formatScore(decision.technicalScore)}</span>
                <span>FINAL {formatScore(decision.finalScore)}</span>
                {decision.rejectionStage && <span>{decision.rejectionStage.toUpperCase()}</span>}
                {decision.direction === "SHORT" && decision.shortProtectionWouldBlock && (
                  <span className="text-yellow-400">SHORT WOULD BLOCK</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDecisionScore(decision?: Pick<ScannerDiagnosticDecision, "finalScore" | "scoreAvailable">): string {
  if (!decision?.scoreAvailable) return "N/A";
  return formatScore(decision.finalScore);
}

function formatScore(value?: number): string {
  return value == null || !Number.isFinite(value) ? "---" : value.toFixed(1);
}

function formatPercent(value?: number): string {
  return value == null || !Number.isFinite(value) ? "---" : `${(value * 100).toFixed(1)}%`;
}

function formatCurrencyValue(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "---";
  return `${value >= 0 ? "+" : ""}$${value.toFixed(2)}`;
}

function formatDuration(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "---";
  if (value < 60) return `${value.toFixed(0)}m`;
  return `${(value / 60).toFixed(1)}h`;
}

function scoreLabel(key: string): string {
  return key
    .replace(/Score$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toUpperCase();
}

function formatPrice(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "---";
  return value >= 1 ? value.toFixed(2) : value.toPrecision(4);
}

function formatVolume(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "---";
  return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatTime(value?: string | null): string {
  return value ? new Date(value).toLocaleTimeString() : "---";
}

function decisionBadgeClass(decision: string): string {
  if (decision === "ACCEPTED") return "bg-success text-success-foreground";
  if (decision === "SKIPPED") return "border-yellow-500/40 bg-yellow-500/10 text-yellow-400";
  return "text-muted-foreground";
}

function StatusRow({ label, status, ok }: { label: string; status: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between font-mono text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1.5 ${ok ? "text-success" : "text-muted-foreground"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-muted-foreground"}`} />
        {status}
      </span>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  valueColor = "",
  loading = false
}: {
  title: string;
  value: string;
  icon: any;
  valueColor?: string;
  loading?: boolean;
}) {
  return (
    <Card className="border-border bg-card/80 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-24 bg-muted/50" />
            ) : (
              <p className={`text-2xl font-bold font-mono tracking-tight ${valueColor}`}>
                {value}
              </p>
            )}
          </div>
          <div className="p-3 bg-primary/10 rounded-lg text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
