import { useGetScannerDashboard, getGetScannerDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, TrendingUp, TrendingDown, Target, Briefcase, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetScannerDashboard({
    query: {
      queryKey: getGetScannerDashboardQueryKey(),
      refetchInterval: 15000
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">System Dashboard</h1>
        <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground bg-card px-3 py-1.5 rounded-md border border-border">
          <span>Last Scan: {dashboard?.lastScanAt ? new Date(dashboard.lastScanAt).toLocaleTimeString() : '---'}</span>
          <div className="w-px h-4 bg-border" />
          <span className="flex items-center gap-2">
            Status: 
            {isLoading ? (
              <span className="text-muted-foreground">LOADING</span>
            ) : dashboard?.scannerRunning ? (
              <span className="text-success flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                ACTIVE
              </span>
            ) : (
              <span className="text-destructive flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                STOPPED
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Daily PnL"
          value={dashboard?.todayPnl != null ? `$${dashboard.todayPnl.toFixed(2)}` : '---'}
          icon={DollarSign}
          valueColor={dashboard && dashboard.todayPnl > 0 ? "text-success" : dashboard && dashboard.todayPnl < 0 ? "text-destructive" : ""}
          loading={isLoading}
        />
        <StatCard
          title="Total PnL"
          value={dashboard?.totalPnl != null ? `$${dashboard.totalPnl.toFixed(2)}` : '---'}
          icon={Activity}
          valueColor={dashboard && dashboard.totalPnl > 0 ? "text-success" : dashboard && dashboard.totalPnl < 0 ? "text-destructive" : ""}
          loading={isLoading}
        />
        <StatCard
          title="Win Rate"
          value={dashboard?.winRate != null ? `${(dashboard.winRate * 100).toFixed(1)}%` : '---'}
          icon={Target}
          loading={isLoading}
        />
        <StatCard
          title="Open Trades"
          value={dashboard?.openTrades?.toString() || '0'}
          icon={Briefcase}
          loading={isLoading}
        />
        <StatCard
          title="Active Signals"
          value={dashboard?.activeSignals?.toString() || '0'}
          icon={Activity}
          loading={isLoading}
        />
        <StatCard
          title="Total Coins Tracked"
          value={dashboard?.totalCoins?.toString() || '0'}
          icon={TrendingUp}
          loading={isLoading}
        />
        <StatCard
          title="Top Gainers"
          value={dashboard?.topGainersCount?.toString() || '0'}
          icon={TrendingUp}
          valueColor="text-success"
          loading={isLoading}
        />
        <StatCard
          title="Top Losers"
          value={dashboard?.topLosersCount?.toString() || '0'}
          icon={TrendingDown}
          valueColor="text-destructive"
          loading={isLoading}
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Placeholder for future detailed widgets */}
        <Card className="col-span-1 border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center font-mono text-sm text-muted-foreground border border-dashed border-border rounded">
              AWAITING MARKET DATA
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  valueColor = "",
  loading = false
}: { 
  title: string; 
  value: string; 
  icon: any;
  valueColor?: string;
  loading?: boolean;
}) {
  return (
    <Card className="border-border bg-card/80 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-24 bg-muted/50" />
            ) : (
              <p className={`text-2xl font-bold font-mono tracking-tight ${valueColor}`}>
                {value}
              </p>
            )}
          </div>
          <div className="p-3 bg-primary/10 rounded-lg text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}