import { useState, type ComponentType } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Gauge,
  Lightbulb,
  LineChart,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type AIInsight,
  type AIJournalResponse,
  type AIMarketSummaryResponse,
  type AITrade,
  type AITradeReviewResponse,
  useAIMentor,
} from "@/lib/ai-api";

type Icon = ComponentType<{ className?: string }>;

export function AIChatCard({ defaultQuestion = "" }: { defaultQuestion?: string }) {
  const [draft, setDraft] = useState(defaultQuestion);
  const [question, setQuestion] = useState(defaultQuestion);
  const [asked, setAsked] = useState(Boolean(defaultQuestion));
  const { data, isFetching, isError, error, refetch } = useAIMentor(question, undefined, asked && question.length > 0);

  function submit() {
    const next = draft.trim();
    if (!next) return;
    setQuestion(next);
    setAsked(true);
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-sm font-mono text-primary uppercase">
          <Bot className="h-4 w-4" />
          AI Mentor
          <Badge variant="outline" className="ml-auto font-mono text-[10px]">READ ONLY</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask for coaching on current performance, risk, market context, or trade discipline."
            className="min-h-20 resize-none"
          />
          <Button onClick={submit} disabled={isFetching || !draft.trim()} className="sm:h-20 sm:w-14">
            {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {isError ? (
          <ErrorPanel message={formatErrorMessage(error)} onRetry={() => refetch()} />
        ) : isFetching ? (
          <CardSkeleton lines={4} />
        ) : data?.insight ? (
          <InsightBody insight={data.insight} />
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Mentor responses appear here.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function InsightCard({
  title,
  insight,
  loading,
  error,
  icon: IconComponent = Sparkles,
  onRetry,
}: {
  title: string;
  insight?: AIInsight;
  loading?: boolean;
  error?: boolean;
  icon?: Icon;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-sm font-mono text-primary uppercase">
          <IconComponent className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? <CardSkeleton lines={5} /> : error ? <ErrorPanel onRetry={onRetry} /> : insight ? <InsightBody insight={insight} /> : <EmptyPanel />}
      </CardContent>
    </Card>
  );
}

export function PerformanceCard({
  title,
  value,
  detail,
  icon: IconComponent = LineChart,
  loading,
  tone = "default",
}: {
  title: string;
  value: string;
  detail?: string;
  icon?: Icon;
  loading?: boolean;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <Card className="border-border bg-card/80">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">{title}</div>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className={cn("truncate font-mono text-2xl font-bold", tone === "success" && "text-success", tone === "danger" && "text-destructive")}>
                {value}
              </div>
            )}
            {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
          </div>
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <IconComponent className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TradeReviewCard({
  review,
  loading,
  error,
  onRetry,
}: {
  review?: AITradeReviewResponse;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-sm font-mono text-primary uppercase">
          <Target className="h-4 w-4" />
          Trade Review
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <CardSkeleton lines={7} />
        ) : error ? (
          <ErrorPanel onRetry={onRetry} />
        ) : review ? (
          <div className="space-y-5">
            <TradeHeader trade={review.trade} />
            <div className="grid gap-3 md:grid-cols-2">
              <Fact label="Entry" value={formatMoney(review.explain.entry)} />
              <Fact label="Exit" value={review.explain.exit} />
              <Fact label="Risk" value={formatMoney(review.explain.risk)} />
              <Fact label="Alternative" value={review.explain.alternativeScenario} />
            </div>
            <ListBlock title="Strengths" items={review.explain.strengths} tone="success" />
            <ListBlock title="Weaknesses" items={review.explain.weaknesses} />
            <ListBlock title="Mistakes" items={review.explain.mistakes} tone="danger" />
          </div>
        ) : (
          <EmptyPanel />
        )}
      </CardContent>
    </Card>
  );
}

export function JournalCard({
  journal,
  loading,
  error,
  onRetry,
}: {
  journal?: AIJournalResponse["journal"];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-sm font-mono text-primary uppercase">
          <MessageSquare className="h-4 w-4" />
          Journal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        {loading ? (
          <CardSkeleton lines={7} />
        ) : error ? (
          <ErrorPanel onRetry={onRetry} />
        ) : journal ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Fact label="Daily Summary" value={journal.dailySummary} />
              <Fact label="Weekly Summary" value={journal.weeklySummary} />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <ListBlock title="Mistakes" items={journal.mistakes} tone="danger" />
              <ListBlock title="Lessons" items={journal.lessons} tone="success" />
              <ListBlock title="Recurring Problems" items={journal.recurringProblems} />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-mono uppercase text-muted-foreground">Timeline</div>
              <div className="space-y-2">
                {journal.timeline.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                    <Badge variant="outline" className="font-mono">{item.symbol}</Badge>
                    <span className="font-mono text-muted-foreground">{item.direction}</span>
                    <span className={cn("font-mono", item.result === "WIN" ? "text-success" : item.result === "LOSS" ? "text-destructive" : "text-muted-foreground")}>{item.result}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
                  </div>
                ))}
                {journal.timeline.length === 0 && <EmptyPanel />}
              </div>
            </div>
          </>
        ) : (
          <EmptyPanel />
        )}
      </CardContent>
    </Card>
  );
}

export function MarketSummaryCard({
  market,
  loading,
  error,
  onRetry,
}: {
  market?: AIMarketSummaryResponse["market"];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-sm font-mono text-primary uppercase">
          <Gauge className="h-4 w-4" />
          Market Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        {loading ? (
          <CardSkeleton lines={6} />
        ) : error ? (
          <ErrorPanel onRetry={onRetry} />
        ) : market ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Current Regime" value={market.currentRegime} />
              <Fact label="Session" value={market.session} />
              <Fact label="Trend" value={`${market.trend.toFixed(1)}`} />
              <Fact label="Liquidity" value={`${market.liquidity.toFixed(1)}`} />
            </div>
            <RiskCard grade={market.marketRisk} value={market.trend} loading={false} />
            <div className="grid gap-2 sm:grid-cols-2">
              {market.topMovers.map((mover) => (
                <div key={mover.symbol} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono font-bold">{mover.symbol}</div>
                    <Badge variant="outline" className="font-mono text-[10px]">{mover.riskGrade}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>{mover.regime}</span>
                    <span className="text-right font-mono">T {mover.trendScore.toFixed(1)} L {mover.liquidityScore.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyPanel />
        )}
      </CardContent>
    </Card>
  );
}

export function RecommendationCard({
  recommendations,
  loading,
}: {
  recommendations?: string[];
  loading?: boolean;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-sm font-mono text-primary uppercase">
          <Lightbulb className="h-4 w-4" />
          AI Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? <CardSkeleton lines={4} /> : <ListBlock title="Next Focus" items={recommendations ?? []} />}
      </CardContent>
    </Card>
  );
}

export function RiskCard({
  grade,
  value,
  loading,
}: {
  grade?: string;
  value?: number;
  loading?: boolean;
}) {
  const normalized = normalizePercent(value ?? 0);
  return (
    <Card className="border-border bg-card/80">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono uppercase text-muted-foreground">Risk</div>
            {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <div className="mt-1 font-mono text-xl font-bold">{grade ?? "UNKNOWN"}</div>}
          </div>
          <ShieldAlert className={cn("h-5 w-5", riskTone(grade))} />
        </div>
        <Progress value={normalized} className="mt-4 h-2" />
        <div className="mt-2 text-xs font-mono text-muted-foreground">{normalized.toFixed(0)}%</div>
      </CardContent>
    </Card>
  );
}

export function ConfidenceCard({
  label = "Confidence",
  value,
  explanation,
  loading,
}: {
  label?: string;
  value?: number;
  explanation?: string;
  loading?: boolean;
}) {
  const normalized = normalizePercent(value ?? 0);
  return (
    <Card className="border-border bg-card/80">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono uppercase text-muted-foreground">{label}</div>
          <CheckCircle2 className="h-4 w-4 text-primary" />
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-20" />
        ) : (
          <>
            <div className="mt-2 font-mono text-2xl font-bold">{normalized.toFixed(0)}%</div>
            <Progress value={normalized} className="mt-3 h-2" />
            {explanation && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{explanation}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InsightBody({ insight }: { insight: AIInsight }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-foreground">{insight.summary}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <ListBlock title="Strengths" items={insight.strengths} tone="success" />
        <ListBlock title="Weaknesses" items={insight.weaknesses} />
        <ListBlock title="Risk Factors" items={insight.riskFactors} tone="danger" />
        <ListBlock title="Improvements" items={insight.suggestedImprovements} />
      </div>
      {insight.confidenceExplanation && (
        <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          {insight.confidenceExplanation}
        </div>
      )}
    </div>
  );
}

function TradeHeader({ trade }: { trade: AITrade }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 p-3">
      <Badge variant="outline" className="font-mono text-sm">{trade.symbol}</Badge>
      <Badge variant="secondary" className="font-mono">{trade.direction}</Badge>
      <span className="text-sm text-muted-foreground">{trade.setupType ?? "Unclassified"}</span>
      {trade.pnl != null && (
        <span className={cn("ml-auto font-mono text-sm font-bold", trade.pnl >= 0 ? "text-success" : "text-destructive")}>
          {formatMoney(trade.pnl)}
        </span>
      )}
    </div>
  );
}

function ListBlock({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "success" | "danger" }) {
  const visible = items.filter(Boolean);
  return (
    <div className="space-y-2">
      <div className="text-xs font-mono uppercase text-muted-foreground">{title}</div>
      {visible.length > 0 ? (
        <ul className="space-y-2">
          {visible.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary", tone === "success" && "bg-success", tone === "danger" && "bg-destructive")} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">No data available.</div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium leading-relaxed text-foreground">{value}</div>
    </div>
  );
}

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn("h-4", index % 3 === 0 ? "w-full" : index % 3 === 1 ? "w-4/5" : "w-2/3")} />
      ))}
    </div>
  );
}

function ErrorPanel({ message = "AI response unavailable.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        {message}
      </span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "AI response unavailable.";
}

function EmptyPanel() {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      No data available.
    </div>
  );
}

function formatMoney(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}$${value.toFixed(2)}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function normalizePercent(value: number): number {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
}

function riskTone(grade?: string): string {
  const normalized = grade?.toUpperCase() ?? "";
  if (normalized.includes("LOW") || normalized === "A") return "text-success";
  if (normalized.includes("HIGH") || normalized.includes("D") || normalized.includes("F")) return "text-destructive";
  return "text-primary";
}
