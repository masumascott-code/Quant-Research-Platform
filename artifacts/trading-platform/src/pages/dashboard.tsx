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
  decision: "ACCEPTED" | "REJECTED" | string;
  strategy: string;
  finalScore: number;
  technicalScore: number;
  confidence: number;
  marketRegime: string;
  opportunityRank: number | null;
  riskGrade: string;
  reasons: string[];
  riskSummary: string[];
  scansToday: number;
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
    averageFinalScore: number;
    averageConfidence: number;
    topRejectedReasons: Array<{ reason: string; count: number }>;
  };
  recentDecisions: ScannerDiagnosticDecision[];
  recentSnapshots?: ScannerDiagnosticSnapshot[];
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
        <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground bg-card px-3 py-1.5 rounded-md border border-border">
          <span>Last Scan: {dashboard?.lastScanAt ? new Date(dashboard.lastScanAt).toLocaleTimeString() : '---'}</span>
          <div className="w-px h-4 bg-border" />
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
                <span>{scannerStatus?.dailyTrades ?? 0} / 5</span>
              </div>
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(((scannerStatus?.dailyTrades ?? 0) / 5) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Weekly Trades</span>
                <span>{scannerStatus?.weeklyTrades ?? 0} / 15</span>
              </div>
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(((scannerStatus?.weeklyTrades ?? 0) / 15) * 100, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ScannerDiagnosticsPanel />
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

function ScannerDiagnosticsPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["scanner-diagnostics", { limit: 12 }],
    queryFn: () => apiFetch<ScannerDiagnostics>("/api/scanner/diagnostics?limit=12"),
    refetchInterval: 15000,
  });

  const latestDecision = data?.recentDecisions[0];
  const latestSnapshot = data?.recentSnapshots?.[0];
  const showScanActivity = !isLoading && (data?.today.totalDecisions ?? 0) === 0 && !!latestSnapshot;
  const latestReason = latestDecision?.reasons[0] ?? latestDecision?.riskSummary[0] ?? "---";

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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border/60">
              <DiagnosticStat label="Decisions Today" value={data?.today.totalDecisions.toString() ?? "---"} loading={isLoading} />
              <DiagnosticStat label="Accepted" value={data?.today.accepted.toString() ?? "---"} valueClassName="text-success" loading={isLoading} />
              <DiagnosticStat label="Rejected" value={data?.today.rejected.toString() ?? "---"} valueClassName="text-destructive" loading={isLoading} />
              <DiagnosticStat label="Avg Score" value={formatScore(data?.today.averageFinalScore)} loading={isLoading} />
              <DiagnosticStat label="Next Scan" value={data?.nextScanIn == null ? "---" : `${data.nextScanIn}s`} loading={isLoading} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0">
              <div className="min-w-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="font-mono text-xs text-muted-foreground">TIME</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground">SYMBOL</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground">DECISION</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground text-right">SCORE</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground">REASON</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="border-border">
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : data?.diagnosticsAvailable === false ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono text-sm">
                          DECISION HISTORY UNAVAILABLE
                        </TableCell>
                      </TableRow>
                    ) : showScanActivity ? (
                      data?.recentSnapshots?.map((snapshot) => (
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
                      ))
                    ) : data?.recentDecisions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono text-sm">
                          NO SCANNER DECISIONS RECORDED
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.recentDecisions.map((decision) => (
                        <TableRow key={decision.id} className="border-border hover:bg-muted/50">
                          <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(decision.createdAt)}
                          </TableCell>
                          <TableCell className="font-mono font-bold whitespace-nowrap">
                            <span>{decision.symbol}</span>
                            <span className={`ml-2 text-xs ${decision.direction === "LONG" ? "text-success" : "text-destructive"}`}>
                              {decision.direction}
                            </span>
                            {decision.scansToday > 1 && (
                              <span className="ml-2 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                x{decision.scansToday}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={decision.decision === "ACCEPTED" ? "default" : "outline"}
                              className={`font-mono ${decision.decision === "ACCEPTED" ? "bg-success text-success-foreground" : "text-muted-foreground"}`}
                            >
                              {decision.decision}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {decision.finalScore.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[360px]">
                            <span className="line-clamp-1">
                              {decision.reasons[0] ?? decision.riskSummary[0] ?? "---"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
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
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                      {data?.message ?? (showScanActivity && latestSnapshot
                        ? `Latest market scan snapshot recorded ${data?.scanActivity?.snapshotsLast10m ?? 0} snapshots in the last 10 minutes.`
                        : latestReason)}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="font-mono text-xs text-muted-foreground uppercase">Top Reject Reasons</div>
                  <div className="mt-2 space-y-2">
                    {data?.today.topRejectedReasons.length ? (
                      data.today.topRejectedReasons.map((item) => (
                        <div key={item.reason} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-muted-foreground line-clamp-1">{item.reason}</span>
                          <span className="font-mono text-destructive">{item.count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground">No rejected decisions today.</div>
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

function formatScore(value?: number): string {
  return value == null || !Number.isFinite(value) ? "---" : value.toFixed(1);
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
