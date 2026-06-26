import { useGetLearningInsights, getGetLearningInsightsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function LearningCenter() {
  const { data: insights, isLoading } = useGetLearningInsights({
    query: { queryKey: getGetLearningInsightsQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          Learning Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Insights and lessons from historical trades</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-success flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> BEST SETUPS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                {insights?.bestSetups?.map((setup, i) => (
                  <li key={i}>{setup}</li>
                ))}
                {(!insights?.bestSetups || insights.bestSetups.length === 0) && <li>No data available</li>}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-destructive flex items-center gap-2">
                <TrendingDown className="h-4 w-4" /> WORST SETUPS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                {insights?.worstSetups?.map((setup, i) => (
                  <li key={i}>{setup}</li>
                ))}
                {(!insights?.worstSetups || insights.worstSetups.length === 0) && <li>No data available</li>}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border bg-card md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-primary flex items-center gap-2">
                KEY LESSONS LEARNED
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                {insights?.keyLessons?.map((lesson, i) => (
                  <li key={i}>{lesson}</li>
                ))}
                {(!insights?.keyLessons || insights.keyLessons.length === 0) && <li>No data available</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}