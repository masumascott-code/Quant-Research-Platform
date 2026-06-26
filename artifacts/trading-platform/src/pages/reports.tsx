import { useGetDailyReport, getGetDailyReportQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Reports() {
  const { data: report, isLoading } = useGetDailyReport({
    query: { queryKey: getGetDailyReportQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Performance Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Automated daily and weekly summaries</p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-sm font-mono text-primary flex justify-between items-center">
            DAILY REPORT
            <span className="text-muted-foreground">{report?.date || new Date().toISOString().split('T')[0]}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-24 w-full mt-6" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 p-4 rounded-lg border border-border/50">
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">Trades</div>
                  <div className="font-mono text-lg font-bold">{report?.totalTrades || 0}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">Win Rate</div>
                  <div className="font-mono text-lg font-bold">{((report?.winRate || 0) * 100).toFixed(1)}%</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">W/L</div>
                  <div className="font-mono text-lg font-bold text-success">{report?.wins || 0} <span className="text-muted-foreground">/</span> <span className="text-destructive">{report?.losses || 0}</span></div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">PnL</div>
                  <div className={`font-mono text-lg font-bold ${(report?.pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                    ${report?.pnl?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="font-mono text-xs uppercase text-muted-foreground mb-2">Summary</h3>
                <p className="text-sm text-foreground leading-relaxed">
                  {report?.summary || "No trading activity to summarize for this period."}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}