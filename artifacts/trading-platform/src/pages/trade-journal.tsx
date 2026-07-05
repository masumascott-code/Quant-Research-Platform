import { useGetTrades, getGetTradesQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function TradeJournal() {
  const [source, setSource] = useState<"all" | "TECHNICAL" | "SMC">("all");
  const tradeParams = {
    status: "closed" as const,
    limit: 100,
    source: source !== "all" ? source : undefined,
  };
  const { data: tradesData, isLoading } = useGetTrades(
    tradeParams,
    {
      query: {
        queryKey: getGetTradesQueryKey(tradeParams)
      }
    }
  );

  const trades = tradesData || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Trade Journal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">History of all closed positions</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
          <Button variant={source === "all" ? "default" : "outline"} size="sm" className="h-7 font-mono text-xs" onClick={() => setSource("all")}>ALL</Button>
          <Button variant={source === "TECHNICAL" ? "default" : "outline"} size="sm" className="h-7 font-mono text-xs" onClick={() => setSource("TECHNICAL")}>TECH</Button>
          <Button variant={source === "SMC" ? "default" : "outline"} size="sm" className="h-7 font-mono text-xs" onClick={() => setSource("SMC")}>SMC</Button>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-4">
              <Skeleton className="h-5 w-28" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((__, j) => (
                  <Skeleton key={j} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ))
        ) : trades?.length === 0 ? (
          <div className="rounded-md border border-border bg-card py-12 text-center text-sm font-mono text-muted-foreground">
            NO CLOSED TRADES
          </div>
        ) : (
          trades?.map((trade: any) => (
            <TradeJournalCard key={trade.id} trade={trade} />
          ))
        )}
      </div>

      <div className="hidden rounded-md border border-border bg-card overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent bg-muted/30">
              <TableHead className="font-mono text-xs text-muted-foreground py-3">DATE / SYMBOL</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground">DIR</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-center">RESULT</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">PNL</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">SCORE</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">ENTRY / EXIT</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">DURATION</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : trades?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground font-mono text-sm">NO CLOSED TRADES</TableCell>
              </TableRow>
            ) : (
              trades?.map((trade: any) => (
                <TableRow key={trade.id} className="border-border hover:bg-muted/50 transition-colors">
                  <TableCell className="font-mono">
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">{trade.symbol}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(trade.closedAt).toLocaleDateString()}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <SourceBadge item={trade} />
                        {trade.source === "SMC" && trade.strategyLabel && (
                          <span className="text-[10px] text-cyan-300">{trade.strategyLabel}</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`font-mono text-[10px] ${trade.direction === 'LONG' ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}`}>
                      {trade.direction}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`font-mono text-[10px] font-bold tracking-wider
                      ${trade.result === 'WIN' ? 'bg-success text-success-foreground' : 
                        trade.result === 'LOSS' ? 'bg-destructive text-destructive-foreground' : 
                        'bg-muted text-muted-foreground'}`
                    }>
                      {trade.result}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-right">
                    {trade.pnl != null ? (
                      <span className={trade.pnl > 0 ? "text-success font-bold" : trade.pnl < 0 ? "text-destructive font-bold" : "text-muted-foreground"}>
                        {trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                        <br/>
                        <span className="text-[10px] font-normal opacity-80">
                          {trade.pnlPercent > 0 ? '+' : ''}{trade.pnlPercent?.toFixed(2)}%
                        </span>
                      </span>
                    ) : '---'}
                  </TableCell>
                  <TableCell className="font-mono text-right">
                    <span className="text-primary">{trade.signalScore}</span>
                  </TableCell>
                  <TableCell className="font-mono text-right">
                    <div className="flex flex-col text-xs">
                      <span className="text-muted-foreground">{trade.entryPrice.toFixed(4)}</span>
                      <span>{trade.exitPrice?.toFixed(4) || '---'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-right text-muted-foreground text-xs">
                    {trade.holdingDurationMinutes ? `${trade.holdingDurationMinutes}m` : '---'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TradeJournalCard({ trade }: { trade: any }) {
  const pnl = Number(trade.pnl);
  const pnlClass = pnl > 0
    ? "text-success"
    : pnl < 0
    ? "text-destructive"
    : "text-muted-foreground";

  const formatNumber = (value: unknown, decimals: number) => {
    if (value == null || value === "") return "---";
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(decimals) : "---";
  };

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-lg font-bold text-foreground">{trade.symbol}</div>
          <div className="mt-1 text-xs font-mono text-muted-foreground">
            {new Date(trade.closedAt).toLocaleDateString()}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <SourceBadge item={trade} />
            {trade.source === "SMC" && trade.smcScore != null && <span className="text-[10px] text-cyan-300">SMC {trade.smcScore}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant="outline" className={`font-mono text-[10px] ${trade.direction === 'LONG' ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}`}>
            {trade.direction}
          </Badge>
          <Badge className={`font-mono text-[10px] font-bold tracking-wider
            ${trade.result === 'WIN' ? 'bg-success text-success-foreground' :
              trade.result === 'LOSS' ? 'bg-destructive text-destructive-foreground' :
              'bg-muted text-muted-foreground'}`
          }>
            {trade.result}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="rounded border border-border bg-muted/30 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">PnL</div>
          <div className={`mt-1 font-bold ${pnlClass}`}>
            {Number.isFinite(pnl) ? `${pnl > 0 ? '+' : ''}$${formatNumber(trade.pnl, 2)}` : "---"}
          </div>
          {formatNumber(trade.pnlPercent, 2) !== "---" && (
            <div className={`mt-0.5 text-[10px] ${pnlClass}`}>
              {Number(trade.pnlPercent) > 0 ? "+" : ""}{formatNumber(trade.pnlPercent, 2)}%
            </div>
          )}
        </div>
        <div className="rounded border border-border bg-muted/30 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Score</div>
          <div className="mt-1 text-primary">{trade.signalScore ?? "---"}</div>
        </div>
        <div className="rounded border border-border bg-muted/30 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Entry / Exit</div>
          <div className="mt-1 text-muted-foreground">{formatNumber(trade.entryPrice, 4)}</div>
          <div className="text-foreground">{formatNumber(trade.exitPrice, 4)}</div>
        </div>
        <div className="rounded border border-border bg-muted/30 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Duration</div>
          <div className="mt-1 text-muted-foreground">
            {trade.holdingDurationMinutes ? `${trade.holdingDurationMinutes}m` : "---"}
          </div>
        </div>
      </div>
    </div>
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
