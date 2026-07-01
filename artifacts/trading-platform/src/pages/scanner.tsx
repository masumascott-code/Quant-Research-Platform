import { useGetScannerStatus, useStartScanner, useStopScanner, getGetScannerStatusQueryKey, useGetTopGainers, useGetTopLosers, getGetTopGainersQueryKey, getGetTopLosersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Scanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useGetScannerStatus({
    query: {
      queryKey: getGetScannerStatusQueryKey(),
      refetchInterval: 5000
    }
  });

  const { data: gainers, isLoading: gainersLoading } = useGetTopGainers(
    { limit: 5 },
    {
      query: {
        queryKey: getGetTopGainersQueryKey({ limit: 5 }),
        refetchInterval: 30000
      }
    }
  );

  const { data: losers, isLoading: losersLoading } = useGetTopLosers(
    { limit: 5 },
    {
      query: {
        queryKey: getGetTopLosersQueryKey({ limit: 5 }),
        refetchInterval: 30000
      }
    }
  );

  const startMutation = useStartScanner();
  const stopMutation = useStopScanner();

  const handleToggleScanner = () => {
    if (status?.running) {
      stopMutation.mutate(undefined, {
        onSuccess: () => {
          toast({ title: "Scanner Stopped", description: "Market scanning has been halted." });
          queryClient.invalidateQueries({ queryKey: getGetScannerStatusQueryKey() });
        }
      });
    } else {
      startMutation.mutate(undefined, {
        onSuccess: () => {
          toast({ title: "Scanner Started", description: "Market scanning initialized." });
          queryClient.invalidateQueries({ queryKey: getGetScannerStatusQueryKey() });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Scanner Control</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time market analysis engine</p>
        </div>
        <div className="grid gap-2 rounded-lg border border-border bg-card p-2 sm:grid-cols-[auto_auto_1fr] sm:items-center">
          <div className="flex flex-col rounded border border-border/60 px-3 py-2 sm:border-0 sm:border-r sm:px-4">
            <span className="text-[10px] uppercase text-muted-foreground font-mono">Coins Tracked</span>
            <span className="font-mono font-bold text-lg">{statusLoading ? '---' : status?.totalCoinsTracked || 0}</span>
          </div>
          <div className="flex flex-col rounded border border-border/60 px-3 py-2 sm:border-0 sm:px-4">
            <span className="text-[10px] uppercase text-muted-foreground font-mono">Status</span>
            <span className={`font-mono font-bold text-sm flex items-center gap-2 mt-1 ${status?.running ? 'text-success' : 'text-destructive'}`}>
              <span className={`h-2 w-2 rounded-full ${status?.running ? 'bg-success animate-pulse' : 'bg-destructive'}`} />
              {status?.running ? 'RUNNING' : 'HALTED'}
            </span>
          </div>
          <Button 
            variant={status?.running ? "destructive" : "default"} 
            className={`w-full font-mono uppercase tracking-wider sm:ml-2 sm:w-auto ${!status?.running ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
            onClick={handleToggleScanner}
            disabled={startMutation.isPending || stopMutation.isPending || statusLoading}
          >
            {status?.running ? (
              <><Square className="mr-2 h-4 w-4" fill="currentColor" /> Stop Scanner</>
            ) : (
              <><Play className="mr-2 h-4 w-4" fill="currentColor" /> Start Scanner</>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-success">
              <ArrowUpRight className="h-4 w-4" />
              TOP GAINERS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-2 p-3 md:hidden">
              {gainersLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-md border border-border bg-muted/20 p-3">
                    <Skeleton className="h-4 w-20" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </div>
                ))
              ) : gainers?.length === 0 ? (
                <div className="py-6 text-center text-sm font-mono text-muted-foreground">NO GAINERS DETECTED</div>
              ) : (
                gainers?.map((coin) => (
                  <div key={`${coin.symbol}-${coin.id}`} className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-base font-bold text-foreground">{coin.symbol}</div>
                        <div className="mt-1 text-xs font-mono text-muted-foreground">RVOL {coin.rvol.toFixed(1)}x</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm text-success">+{coin.priceChangePercent.toFixed(2)}%</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">24H</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="rounded border border-border bg-background/40 p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Price</div>
                        <div className="mt-1 text-foreground">{coin.price.toFixed(4)}</div>
                      </div>
                      <div className="rounded border border-border bg-background/40 p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Signal</div>
                        <div className="mt-1 text-success">Gainer</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden md:block">
              <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono text-xs text-muted-foreground">SYMBOL</TableHead>
                  <TableHead className="font-mono text-xs text-muted-foreground text-right">PRICE</TableHead>
                  <TableHead className="font-mono text-xs text-muted-foreground text-right">24H %</TableHead>
                  <TableHead className="font-mono text-xs text-muted-foreground text-right">RVOL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gainersLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell align="right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell align="right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell align="right"><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : gainers?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground font-mono text-sm">NO GAINERS DETECTED</TableCell>
                  </TableRow>
                ) : (
                  gainers?.map((coin) => (
                    <TableRow key={`${coin.symbol}-${coin.id}`} className="border-border hover:bg-muted/50">
                      <TableCell className="font-mono font-bold">{coin.symbol}</TableCell>
                      <TableCell className="font-mono text-right">{coin.price.toFixed(4)}</TableCell>
                      <TableCell className="font-mono text-right text-success">+{coin.priceChangePercent.toFixed(2)}%</TableCell>
                      <TableCell className="font-mono text-right text-muted-foreground">{coin.rvol.toFixed(1)}x</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <ArrowDownRight className="h-4 w-4" />
              TOP LOSERS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-2 p-3 md:hidden">
              {losersLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-md border border-border bg-muted/20 p-3">
                    <Skeleton className="h-4 w-20" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </div>
                ))
              ) : losers?.length === 0 ? (
                <div className="py-6 text-center text-sm font-mono text-muted-foreground">NO LOSERS DETECTED</div>
              ) : (
                losers?.map((coin) => (
                  <div key={`${coin.symbol}-${coin.id}`} className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-base font-bold text-foreground">{coin.symbol}</div>
                        <div className="mt-1 text-xs font-mono text-muted-foreground">RVOL {coin.rvol.toFixed(1)}x</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm text-destructive">{coin.priceChangePercent.toFixed(2)}%</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">24H</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="rounded border border-border bg-background/40 p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Price</div>
                        <div className="mt-1 text-foreground">{coin.price.toFixed(4)}</div>
                      </div>
                      <div className="rounded border border-border bg-background/40 p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Signal</div>
                        <div className="mt-1 text-destructive">Loser</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden md:block">
              <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono text-xs text-muted-foreground">SYMBOL</TableHead>
                  <TableHead className="font-mono text-xs text-muted-foreground text-right">PRICE</TableHead>
                  <TableHead className="font-mono text-xs text-muted-foreground text-right">24H %</TableHead>
                  <TableHead className="font-mono text-xs text-muted-foreground text-right">RVOL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {losersLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell align="right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell align="right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell align="right"><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : losers?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground font-mono text-sm">NO LOSERS DETECTED</TableCell>
                  </TableRow>
                ) : (
                  losers?.map((coin) => (
                    <TableRow key={`${coin.symbol}-${coin.id}`} className="border-border hover:bg-muted/50">
                      <TableCell className="font-mono font-bold">{coin.symbol}</TableCell>
                      <TableCell className="font-mono text-right">{coin.price.toFixed(4)}</TableCell>
                      <TableCell className="font-mono text-right text-destructive">{coin.priceChangePercent.toFixed(2)}%</TableCell>
                      <TableCell className="font-mono text-right text-muted-foreground">{coin.rvol.toFixed(1)}x</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
