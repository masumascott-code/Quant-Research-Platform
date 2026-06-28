import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightCard, PerformanceCard, RecommendationCard } from "@/components/ai/ai-cards";
import { useAIStrategyReview } from "@/lib/ai-api";

export default function AIStrategyReviewPage() {
  const query = useAIStrategyReview();
  const comparison = query.data?.comparison;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6 text-primary" />
            AI Strategy Review
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Strategy comparison, suitability, and improvements</p>
        </div>
        <Badge variant="outline" className="w-fit font-mono">ADVISORY ONLY</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PerformanceCard title="Best Strategy" value={comparison?.bestStrategy ?? "No data"} loading={query.isLoading} icon={BarChart3} />
        <PerformanceCard title="Weakest Strategy" value={comparison?.weakestStrategy ?? "No data"} loading={query.isLoading} icon={BarChart3} />
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-sm font-mono text-primary uppercase">Strategy Performance</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {query.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-12 rounded-md bg-muted/40" />)}
            </div>
          ) : comparison?.strategies.length ? (
            <div className="space-y-2">
              {comparison.strategies.map((strategy) => (
                <div key={`${strategy.setupType}-${strategy.direction}`} className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm md:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr]">
                  <div>
                    <div className="font-mono font-bold">{strategy.setupType}</div>
                    <div className="text-xs text-muted-foreground">{strategy.direction}</div>
                  </div>
                  <Metric label="Win Rate" value={`${(strategy.winRate * 100).toFixed(1)}%`} />
                  <Metric label="Avg PnL" value={`${strategy.avgPnl >= 0 ? "+" : ""}${strategy.avgPnl.toFixed(2)}`} />
                  <Metric label="Trades" value={String(strategy.totalTrades)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No strategy statistics available.</div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <InsightCard
          title="Strategy Insight"
          insight={query.data?.insight}
          loading={query.isLoading}
          error={query.isError}
          onRetry={() => query.refetch()}
          icon={BarChart3}
        />
        <RecommendationCard recommendations={query.data?.insight.suggestedImprovements} loading={query.isLoading} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono font-semibold">{value}</div>
    </div>
  );
}
