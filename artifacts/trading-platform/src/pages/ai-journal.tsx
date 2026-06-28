import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InsightCard, JournalCard } from "@/components/ai/ai-cards";
import { useAIJournal } from "@/lib/ai-api";

export default function AIJournalPage() {
  const query = useAIJournal();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BookOpen className="h-6 w-6 text-primary" />
            AI Journal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Timeline, lessons, mistakes, and recurring problems</p>
        </div>
        <Badge variant="outline" className="w-fit font-mono">READ ONLY</Badge>
      </div>

      <JournalCard journal={query.data?.journal} loading={query.isLoading} error={query.isError} onRetry={() => query.refetch()} />
      <InsightCard
        title="Journal Insight"
        insight={query.data?.insight}
        loading={query.isLoading}
        error={query.isError}
        onRetry={() => query.refetch()}
      />
    </div>
  );
}
