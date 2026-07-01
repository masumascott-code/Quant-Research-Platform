import { useGetTopGainers, getGetTopGainersQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight } from "lucide-react";

export default function Gainers() {
  const { data: gainers, isLoading } = useGetTopGainers(
    { limit: 50 },
    {
      query: {
        queryKey: getGetTopGainersQueryKey({ limit: 50 }),
        refetchInterval: 30000
      }
    }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ArrowUpRight className="h-6 w-6 text-success" />
          Top Gainers
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Market leaders by 24h performance</p>
      </div>

      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-4">
              <Skeleton className="h-5 w-24" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((__, j) => (
                  <Skeleton key={j} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ))
        ) : gainers?.length === 0 ? (
          <div className="rounded-md border border-border bg-card py-12 text-center text-sm font-mono text-muted-foreground">
            NO GAINERS DETECTED
          </div>
        ) : (
          gainers?.map((coin) => (
            <div key={`${coin.symbol}-${coin.id}`} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{coin.rank}</span>
                    <span className="font-mono text-lg font-bold text-foreground">{coin.symbol}</span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">${(coin.volume24h / 1000000).toFixed(2)}M volume</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-semibold text-success">+{coin.priceChangePercent.toFixed(2)}%</div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">24H</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="rounded border border-border bg-muted/30 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Price</div>
                  <div className="mt-1 text-foreground">{coin.price.toFixed(4)}</div>
                </div>
                <div className="rounded border border-border bg-muted/30 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">RVOL</div>
                  <div className="mt-1 text-foreground">{coin.rvol.toFixed(2)}x</div>
                </div>
                <div className="col-span-2 rounded border border-border bg-muted/30 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Trend</div>
                  <div className={`mt-1 w-fit rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                    coin.trend === 'UP' ? 'bg-success/20 text-success' :
                    coin.trend === 'DOWN' ? 'bg-destructive/20 text-destructive' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {coin.trend || 'NEUTRAL'}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden rounded-md border border-border bg-card overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent bg-muted/30">
              <TableHead className="font-mono text-xs text-muted-foreground py-3">RANK</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground">SYMBOL</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">PRICE</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">24H CHANGE</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">RVOL</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">24H VOLUME</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">TREND</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 15 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : gainers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground font-mono text-sm">NO GAINERS DETECTED</TableCell>
              </TableRow>
            ) : (
              gainers?.map((coin) => (
                <TableRow key={`${coin.symbol}-${coin.id}`} className="border-border hover:bg-muted/50 transition-colors">
                  <TableCell className="font-mono text-muted-foreground">{coin.rank}</TableCell>
                  <TableCell className="font-mono font-bold text-foreground">{coin.symbol}</TableCell>
                  <TableCell className="font-mono text-right">{coin.price.toFixed(4)}</TableCell>
                  <TableCell className="font-mono text-right text-success font-semibold">+{coin.priceChangePercent.toFixed(2)}%</TableCell>
                  <TableCell className="font-mono text-right">{coin.rvol.toFixed(2)}x</TableCell>
                  <TableCell className="font-mono text-right text-muted-foreground">${(coin.volume24h / 1000000).toFixed(2)}M</TableCell>
                  <TableCell className="font-mono text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                      coin.trend === 'UP' ? 'bg-success/20 text-success' : 
                      coin.trend === 'DOWN' ? 'bg-destructive/20 text-destructive' : 
                      'bg-muted text-muted-foreground'
                    }`}>
                      {coin.trend || 'NEUTRAL'}
                    </span>
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
