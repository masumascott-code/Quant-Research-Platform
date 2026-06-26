import { useGetTrades, getGetTradesQueryKey, GetTradesStatus, GetTradesResult } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TradeJournal() {
  const { data: tradesData, isLoading } = useGetTrades(
    { status: "closed", limit: 100 },
    {
      query: {
        queryKey: getGetTradesQueryKey({ status: "closed", limit: 100 })
      }
    }
  );

  const trades = tradesData?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          Trade Journal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">History of all closed positions</p>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
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