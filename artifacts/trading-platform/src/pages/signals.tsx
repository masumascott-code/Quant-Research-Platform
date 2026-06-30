import { useGetSignals, getGetSignalsQueryKey, GetSignalsStatus, GetSignalsDirection } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Crosshair } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { PriceChart } from "@/components/market/price-chart";

export default function Signals() {
  const [status, setStatus] = useState<GetSignalsStatus | "all">("active");
  const [direction, setDirection] = useState<GetSignalsDirection | "all">("all");

  const { data: signals, isLoading } = useGetSignals(
    { 
      status: status !== "all" ? status : undefined, 
      direction: direction !== "all" ? direction : undefined 
    },
    {
      query: {
        queryKey: getGetSignalsQueryKey({ status: status !== "all" ? status : undefined, direction: direction !== "all" ? direction : undefined }),
        refetchInterval: 30000
      }
    }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Crosshair className="h-6 w-6 text-primary" />
            Trading Signals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Algorithmic trade setups and analysis</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={status} onValueChange={(v: GetSignalsStatus | "all") => setStatus(v)}>
            <SelectTrigger className="w-[140px] font-mono text-sm bg-card">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL STATUSES</SelectItem>
              <SelectItem value="pending">PENDING</SelectItem>
              <SelectItem value="active">ACTIVE</SelectItem>
              <SelectItem value="traded">TRADED</SelectItem>
              <SelectItem value="expired">EXPIRED</SelectItem>
            </SelectContent>
          </Select>

          <Select value={direction} onValueChange={(v: GetSignalsDirection | "all") => setDirection(v)}>
            <SelectTrigger className="w-[140px] font-mono text-sm bg-card">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL DIRS</SelectItem>
              <SelectItem value="LONG">LONG</SelectItem>
              <SelectItem value="SHORT">SHORT</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border bg-card">
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : signals?.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card border border-border border-dashed rounded-lg">
          <Crosshair className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-bold font-mono">NO SIGNALS FOUND</h3>
          <p className="text-sm text-muted-foreground mt-2">Adjust your filters to see more results</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {signals?.map(signal => (
            <Card key={signal.id} className="border-border bg-card/80 overflow-hidden hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl font-bold font-mono flex items-center gap-2">
                      {signal.symbol}
                      <Badge variant="outline" className={`font-mono ${signal.direction === 'LONG' ? 'text-success border-success/30 bg-success/10' : 'text-destructive border-destructive/30 bg-destructive/10'}`}>
                        {signal.direction}
                      </Badge>
                    </CardTitle>
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      {new Date(signal.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <Badge className={`font-mono font-bold text-sm ${signal.grade === 'A+' ? 'bg-primary text-primary-foreground' : 'bg-primary/50 text-primary-foreground'}`}>
                      {signal.grade}
                    </Badge>
                    <span className="text-[10px] uppercase font-mono text-muted-foreground mt-1 tracking-wider">{signal.status}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-muted-foreground">SCORE</span>
                    <span>{signal.score}/100</span>
                  </div>
                  <Progress value={signal.score} className="h-1.5" />
                </div>

                <PriceChart
                  symbol={signal.symbol}
                  direction={signal.direction}
                  levels={{
                    entryPrice: signal.entryPrice,
                    stopLoss: signal.stopLoss,
                    tp1: signal.tp1,
                  }}
                />
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-mono bg-muted/30 p-3 rounded border border-border/50">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">ENTRY</span>
                    <span className="font-bold">{signal.entryPrice}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">STOP LOSS</span>
                    <span className="text-destructive">{signal.stopLoss}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">TP 1</span>
                    <span className="text-success">{signal.tp1}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">R:R RATIO</span>
                    <span className="text-primary">{signal.rrRatio?.toFixed(2) || '---'}</span>
                  </div>
                </div>

                <div className="text-sm">
                  <div className="font-mono text-xs text-muted-foreground mb-1 uppercase">Analysis</div>
                  <p className="text-muted-foreground text-sm leading-relaxed">{signal.reason}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
