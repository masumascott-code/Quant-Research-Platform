import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ShieldCheck, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";

interface ReportTradeDetail {
  id: number;
  tradeId: string;
  symbol: string;
  direction: string;
  setupType: string | null;
  signalGrade: string | null;
  entryPrice: number;
  stopLoss: number;
  currentSl: number | null;
  tp1: number;
  tp2: number;
  tp3: number;
  exitPrice: number | null;
  exitReason: string | null;
  result: "WIN" | "LOSS" | "BREAKEVEN" | null;
  pnl: number | null;
  pnlPercent: number | null;
  maxProfitPercent: number | null;
  maxProfitSource: "tracked_from_price_ticks" | "inferred_from_targets";
  maxDrawdownPercent: number | null;
  gaveBackProfitPercent: number | null;
  wentProfitToLoss: boolean;
  scoreRange: {
    entry: number;
    min: number;
    max: number;
    latest: number;
    samples: number;
    trackedAfterEntry: boolean;
  };
  targets: {
    highestHit: "TP3" | "TP2" | "TP1" | "None";
    tp1Hit: boolean;
    tp2Hit: boolean;
    tp3Hit: boolean;
  };
  stopManagement: {
    movedAfterTp1: boolean;
    movedTo: number | null;
    expectedAfterTp1: number;
    note: string;
  };
  telegramOutcome: string;
  openedAt: string;
  closedAt: string | null;
  holdingDurationMinutes: number | null;
}

interface DailyReport {
  date: string;
  totalTrades: number;
  wins: number;
  losses: number;
  pnl: number;
  winRate: number;
  summary: string;
  trades: ReportTradeDetail[];
}

async function fetchDailyReport() {
  return await apiFetch<DailyReport>("api/reports/daily");
}

function formatPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "$0.00";
  return `${value >= 0 ? "+$" : "-$"}${Math.abs(value).toFixed(2)}`;
}

function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(6);
}

function resultClass(result: ReportTradeDetail["result"]) {
  if (result === "WIN") return "border-green-500/30 bg-green-500/10 text-green-400";
  if (result === "LOSS") return "border-red-500/30 bg-red-500/10 text-red-400";
  return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";
}

export default function Reports() {
  const { data: report, isLoading } = useQuery({
    queryKey: ["daily-report"],
    queryFn: fetchDailyReport,
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Performance Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Automated daily and weekly summaries</p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-sm font-mono text-primary flex justify-between items-center">
            DAILY REPORT
            <span className="text-muted-foreground">{report?.date || new Date().toISOString().split('T')[0]}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-24 w-full mt-6" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 p-4 rounded-lg border border-border/50">
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">Trades</div>
                  <div className="font-mono text-lg font-bold">{report?.totalTrades || 0}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">Win Rate</div>
                  <div className="font-mono text-lg font-bold">{((report?.winRate || 0) * 100).toFixed(1)}%</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">W/L</div>
                  <div className="font-mono text-lg font-bold text-success">{report?.wins || 0} <span className="text-muted-foreground">/</span> <span className="text-destructive">{report?.losses || 0}</span></div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">PnL</div>
                  <div className={`font-mono text-lg font-bold ${(report?.pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                    ${report?.pnl?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="font-mono text-xs uppercase text-muted-foreground mb-2">Summary</h3>
                <p className="text-sm text-foreground leading-relaxed">
                  {report?.summary || "No trading activity to summarize for this period."}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-mono text-xs uppercase text-muted-foreground">Trade Breakdown</h3>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {report?.trades?.length ?? 0} closed
                  </Badge>
                </div>

                {report?.trades?.length ? (
                  <div className="space-y-4">
                    {report.trades.map((trade) => (
                      <div key={trade.id} className="rounded-md border border-border bg-muted/20 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-lg font-bold text-foreground">{trade.symbol}</span>
                              <Badge variant="outline" className="font-mono">{trade.direction}</Badge>
                              <Badge variant="outline" className={`font-mono ${resultClass(trade.result)}`}>
                                {trade.result ?? "OPEN"}
                              </Badge>
                              {trade.signalGrade && <Badge className="font-mono">{trade.signalGrade}</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {trade.tradeId} | {trade.setupType ?? "Setup"} | Exit: {trade.exitReason ?? "N/A"}
                            </div>
                          </div>
                          <div className={`font-mono text-xl font-bold ${(trade.pnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {formatMoney(trade.pnl)}
                            <span className="ml-2 text-sm text-muted-foreground">{formatPct(trade.pnlPercent)}</span>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <MetricBlock
                            icon={<TrendingUp className="h-4 w-4" />}
                            label="Score Movement"
                            value={`${trade.scoreRange.entry.toFixed(0)} -> ${trade.scoreRange.min.toFixed(0)}-${trade.scoreRange.max.toFixed(0)}`}
                            detail={trade.scoreRange.trackedAfterEntry ? `${trade.scoreRange.samples} scanner samples after entry` : "Only entry score available"}
                          />
                          <MetricBlock
                            icon={<TrendingDown className="h-4 w-4" />}
                            label="Profit Then Reversal"
                            value={`${formatPct(trade.maxProfitPercent)} max`}
                            detail={trade.wentProfitToLoss
                              ? `Profit gave back ${formatPct(trade.gaveBackProfitPercent)} and closed loss`
                              : `Gave back ${formatPct(trade.gaveBackProfitPercent)}`}
                          />
                          <MetricBlock
                            icon={<Target className="h-4 w-4" />}
                            label="Target Hit"
                            value={trade.targets.highestHit}
                            detail={`TP1 ${trade.targets.tp1Hit ? "hit" : "no"} | TP2 ${trade.targets.tp2Hit ? "hit" : "no"} | TP3 ${trade.targets.tp3Hit ? "hit" : "no"}`}
                          />
                          <MetricBlock
                            icon={<ShieldCheck className="h-4 w-4" />}
                            label="SL After TP1"
                            value={trade.stopManagement.movedAfterTp1 ? "Updated" : "Not updated"}
                            detail={trade.stopManagement.note}
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                          <DetailLine
                            label="Entry / Exit"
                            value={`${formatPrice(trade.entryPrice)} -> ${formatPrice(trade.exitPrice)}`}
                          />
                          <DetailLine
                            label="SL / Current SL"
                            value={`${formatPrice(trade.stopLoss)} -> ${formatPrice(trade.currentSl)}`}
                          />
                          <DetailLine
                            label="Telegram Close"
                            value={trade.telegramOutcome}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    No closed trades found for this daily report.
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricBlock({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded border border-border bg-card/60 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-base font-bold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/70 bg-background/40 p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-mono text-xs text-foreground">{value}</div>
    </div>
  );
}
