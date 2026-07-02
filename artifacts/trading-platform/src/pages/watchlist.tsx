import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, TrendingUp, TrendingDown, Clock, CheckCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { PriceChart } from "@/components/market/price-chart";

interface WatchlistItem {
  id: number;
  symbol: string;
  direction: string;
  score: string;
  confidence: string;
  setupType: string;
  entryPrice: string;
  stopLoss: string;
  tp1: string;
  tp2: string;
  tp3: string;
  rrRatio: string;
  reason: string;
  isActive: boolean;
  promoted: boolean;
  createdAt: string;
  decisionConfidence?: number;
  latestScoreAt?: string;
  expiresAt: string;
}

interface WatchlistThresholds {
  minScoreWatchlist: number;
  minScoreTrade: number;
}

async function fetchWatchlist() {
  return await apiFetch<{ active: WatchlistItem[]; history: WatchlistItem[]; thresholds: WatchlistThresholds }>("api/watchlist");
}

function confidenceBadge(c: string) {
  const map: Record<string, string> = {
    "Extreme": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "Very High": "bg-green-500/20 text-green-400 border-green-500/30",
    "High": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "Medium": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    "Low": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return map[c] ?? map["Medium"];
}

function WatchlistCard({ item, minTradeScore }: { item: WatchlistItem; minTradeScore: number }) {
  const isLong = item.direction === "LONG";
  const score = Number(item.score);

  return (
    <Card className="bg-card border border-border hover:border-primary/40 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {isLong ? (
              <TrendingUp className="h-4 w-4 text-green-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-400" />
            )}
            <span className="font-bold text-foreground font-mono">{item.symbol}</span>
            <Badge variant="outline" className={isLong ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30"}>
              {item.direction}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {item.promoted && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Promoted
              </Badge>
            )}
            <div className={`text-lg font-bold font-mono ${score >= 87 ? "text-yellow-400" : "text-primary"}`}>
              {score.toFixed(0)}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          <Badge variant="outline" className="text-xs text-muted-foreground">{item.setupType}</Badge>
          <Badge variant="outline" className={`text-xs ${confidenceBadge(item.confidence)}`}>
            Tech: {item.confidence}
          </Badge>
          {item.decisionConfidence != null && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Final Conf: {Number(item.decisionConfidence).toFixed(1)}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
          <div>
            <div className="text-muted-foreground">Entry</div>
            <div className="text-foreground">{Number(item.entryPrice).toFixed(4)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">SL</div>
            <div className="text-red-400">{Number(item.stopLoss).toFixed(4)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">RR</div>
            <div className="text-green-400">{Number(item.rrRatio ?? 0).toFixed(2)}:1</div>
          </div>
        </div>

        <PriceChart
          symbol={item.symbol}
          direction={item.direction}
          compact
          className="mt-3"
          levels={{
            entryPrice: Number(item.entryPrice),
            stopLoss: Number(item.stopLoss),
            tp1: Number(item.tp1),
          }}
        />

        <div className="mt-3 text-xs text-muted-foreground border-t border-border pt-2 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{new Date(item.latestScoreAt ?? item.createdAt).toLocaleTimeString()}</span>
          <span className="ml-auto">Score needed to trade: {minTradeScore}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function watchlistRangeLabel(thresholds?: WatchlistThresholds) {
  const minWatchlistScore = thresholds?.minScoreWatchlist ?? 80;
  const minTradeScore = thresholds?.minScoreTrade ?? 90;
  if (minWatchlistScore >= minTradeScore) return `${minWatchlistScore}+`;
  return `${minWatchlistScore}-${Math.max(minWatchlistScore, minTradeScore - 1)}`;
}

export default function Watchlist() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["watchlist"],
    queryFn: fetchWatchlist,
    refetchInterval: 10000,
  });
  const minTradeScore = data?.thresholds.minScoreTrade ?? 80;
  const scoreRange = watchlistRangeLabel(data?.thresholds);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-yellow-500/20 p-2 rounded-lg">
          <Eye className="h-5 w-5 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Smart Watchlist</h1>
          <p className="text-sm text-muted-foreground">Near-miss signals (score {scoreRange}) being monitored for promotion</p>
        </div>
        <div className="ml-auto bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5">
          <span className="text-xs font-mono text-yellow-400">
            {data?.active.length ?? 0} watching
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-sm animate-pulse">Loading watchlist...</div>
      )}

      {error && (
        <div className="text-destructive text-sm">Failed to load watchlist</div>
      )}

      {data && (
        <>
          {data.active.length > 0 ? (
            <div>
              <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-3">
                Active Monitoring ({data.active.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.active.map(item => (
                  <WatchlistCard key={item.id} item={item} minTradeScore={minTradeScore} />
                ))}
              </div>
            </div>
          ) : (
            <Card className="bg-card border-dashed border-border">
              <CardContent className="p-8 text-center">
                <Eye className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No symbols currently being watched</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Symbols scoring {scoreRange} will appear here and be monitored for improvement</p>
              </CardContent>
            </Card>
          )}

          {data.history.length > 0 && (
            <div>
              <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-3">
                Recent History ({data.history.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.history.slice(0, 12).map(item => (
                  <div key={item.id} className="opacity-50">
                    <WatchlistCard item={item} minTradeScore={minTradeScore} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
