import { CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InsightCard, RecommendationCard } from "@/components/ai/ai-cards";
import { useAIWeeklyReport } from "@/lib/ai-api";

export default function AIWeeklyReportPage() {
  const query = useAIWeeklyReport();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarRange className="h-6 w-6 text-primary" />
            AI Weekly Report
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Weekly performance trends and strategy comparison</p>
        </div>
        <Badge variant="outline" className="w-fit font-mono">ADVISORY ONLY</Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <InsightCard
          title="Weekly Report"
          insight={query.data?.insight}
          loading={query.isLoading}
          error={query.isError}
          onRetry={() => query.refetch()}
          icon={CalendarRange}
        />
        <RecommendationCard recommendations={query.data?.insight.suggestedImprovements} loading={query.isLoading} />
      </div>
    </div>
  );
}
