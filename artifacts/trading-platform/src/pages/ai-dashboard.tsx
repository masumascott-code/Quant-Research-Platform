import { Activity, BarChart3, BookOpen, DollarSign, Gauge, Medal, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ConfidenceCard,
  InsightCard,
  PerformanceCard,
  RecommendationCard,
  RiskCard,
} from "@/components/ai/ai-cards";
import { useAIDashboard } from "@/lib/ai-api";

export default function AIDashboard() {
  const query = useAIDashboard();
  const widgets = query.data?.widgets;
  const topOpportunity = widgets?.topOpportunities[0];

  return (
    <div className="space-y-6">
      <AIHeader title="AI Dashboard" subtitle="Read-only intelligence layer" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PerformanceCard
          title="Today's Performance"
          value={`${widgets?.todayPerformance.trades ?? 0} trades`}
          detail={`${percent(widgets?.todayPerformance.winRate)} win rate`}
          icon={Activity}
          loading={query.isLoading}
        />
        <PerformanceCard
          title="Win Rate"
          value={percent(widgets?.winRate)}
          icon={Target}
          loading={query.isLoading}
        />
        <PerformanceCard
          title="PnL"
          value={money(widgets?.pnl)}
          icon={DollarSign}
          loading={query.isLoading}
          tone={(widgets?.pnl ?? 0) >= 0 ? "success" : "danger"}
        />
        <RiskCard
          grade={widgets?.risk.grade}
          value={widgets?.risk.usagePercent}
          loading={query.isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TradeSnapshot title="Best Trade" trade={widgets?.bestTrade} loading={query.isLoading} icon={Medal} />
        <TradeSnapshot title="Worst Trade" trade={widgets?.worstTrade} loading={query.isLoading} icon={TrendingDown} />
        <PerformanceCard
          title="Current Market Regime"
          value={widgets?.currentMarketRegime ?? "UNKNOWN"}
          icon={Gauge}
          loading={query.isLoading}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-sm font-mono text-primary uppercase">
              <TrendingUp className="h-4 w-4" />
              Top Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {query.isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 rounded-md bg-muted/40" />)}
              </div>
            ) : widgets?.topOpportunities.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {widgets.topOpportunities.map((item) => (
                  <div key={`${item.symbol}-${item.createdAt}`} className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{item.symbol}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">{item.direction}</Badge>
                      <span className="ml-auto font-mono text-sm">{item.score.toFixed(1)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{item.strategy}</span>
                      <span>{item.decision}</span>
                      <span>{item.riskGrade}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No opportunities available.</div>
            )}
          </CardContent>
        </Card>

        <ConfidenceCard
          value={topOpportunity?.confidence}
          explanation={query.data?.insight.confidenceExplanation}
          loading={query.isLoading}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <RecommendationCard recommendations={query.data?.recommendations} loading={query.isLoading} />
        <JournalSummary notes={widgets?.journalSummary.notes} lessons={widgets?.journalSummary.lessons} loading={query.isLoading} />
      </div>

      <InsightCard
        title="Dashboard Insight"
        insight={query.data?.insight}
        loading={query.isLoading}
        error={query.isError}
        onRetry={() => query.refetch()}
        icon={BarChart3}
      />
    </div>
  );
}

function AIHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <Badge variant="outline" className="w-fit font-mono">ADVISORY ONLY</Badge>
    </div>
  );
}

function TradeSnapshot({ title, trade, loading, icon: Icon }: { title: string; trade?: any; loading?: boolean; icon: typeof Medal }) {
  return (
    <PerformanceCard
      title={title}
      value={trade ? `${trade.symbol} ${money(trade.pnl)}` : "No trade"}
      detail={trade ? `${trade.direction} ${trade.result ?? trade.status}` : undefined}
      icon={Icon}
      loading={loading}
      tone={(trade?.pnl ?? 0) >= 0 ? "success" : "danger"}
    />
  );
}

function JournalSummary({ notes, lessons, loading }: { notes?: string[]; lessons?: string[]; loading?: boolean }) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-sm font-mono text-primary uppercase">
          <BookOpen className="h-4 w-4" />
          Journal Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-muted/40" />
            <div className="h-4 w-4/5 rounded bg-muted/40" />
          </div>
        ) : (
          <>
            <MiniList title="Notes" items={notes ?? []} />
            <MiniList title="Lessons" items={lessons ?? []} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-mono uppercase text-muted-foreground">{title}</div>
      {items.length ? items.slice(0, 3).map((item, index) => (
        <div key={index} className="text-sm text-muted-foreground">{item}</div>
      )) : <div className="text-sm text-muted-foreground">No data available.</div>}
    </div>
  );
}

function percent(value?: number): string {
  const normalized = value == null ? 0 : value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

function money(value?: number | null): string {
  const current = value ?? 0;
  return `${current >= 0 ? "+" : ""}$${current.toFixed(2)}`;
}
