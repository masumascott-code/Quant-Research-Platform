import { Search, Target } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfidenceCard, InsightCard, TradeReviewCard } from "@/components/ai/ai-cards";
import { useAITradeReview } from "@/lib/ai-api";

export default function AITradeReviewPage() {
  const [draftTradeId, setDraftTradeId] = useState("");
  const [tradeId, setTradeId] = useState<string | undefined>(undefined);
  const query = useAITradeReview(tradeId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Target className="h-6 w-6 text-primary" />
            AI Trade Review
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Entry, exit, risk, mistakes, and alternatives</p>
        </div>
        <Badge variant="outline" className="w-fit font-mono">ADVISORY ONLY</Badge>
      </div>

      <div className="flex gap-2">
        <Input
          value={draftTradeId}
          onChange={(event) => setDraftTradeId(event.target.value)}
          placeholder="Trade ID"
          className="max-w-md"
        />
        <Button onClick={() => setTradeId(draftTradeId.trim() || undefined)}>
          <Search className="mr-2 h-4 w-4" />
          Review
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <TradeReviewCard review={query.data} loading={query.isLoading} error={query.isError} onRetry={() => query.refetch()} />
        <ConfidenceCard
          value={query.data?.trade.signalScore}
          explanation={query.data?.insight.confidenceExplanation}
          loading={query.isLoading}
        />
      </div>

      <InsightCard
        title="AI Explanation"
        insight={query.data?.insight}
        loading={query.isLoading}
        error={query.isError}
        onRetry={() => query.refetch()}
      />
    </div>
  );
}
