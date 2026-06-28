import { Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InsightCard, MarketSummaryCard } from "@/components/ai/ai-cards";
import { useAIMarketSummary } from "@/lib/ai-api";

export default function AIMarketSummaryPage() {
  const query = useAIMarketSummary();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Gauge className="h-6 w-6 text-primary" />
            AI Market Summary
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Regime, session, trend, liquidity, movers, and risk</p>
        </div>
        <Badge variant="outline" className="w-fit font-mono">READ ONLY</Badge>
      </div>

      <MarketSummaryCard market={query.data?.market} loading={query.isLoading} error={query.isError} onRetry={() => query.refetch()} />
      <InsightCard
        title="Market Insight"
        insight={query.data?.insight}
        loading={query.isLoading}
        error={query.isError}
        onRetry={() => query.refetch()}
        icon={Gauge}
      />
    </div>
  );
}
