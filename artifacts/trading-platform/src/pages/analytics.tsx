import { useGetAnalyticsDashboard, getGetAnalyticsDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, TrendingUp, Target, DollarSign } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function Analytics() {
  const { data: analytics, isLoading } = useGetAnalyticsDashboard({
    query: { queryKey: getGetAnalyticsDashboardQueryKey() }
  });

  const pnlData = analytics?.dailyPerformance?.map(d => ({
    date: d.date.split('T')[0],
    pnl: d.pnl
  })) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart2 className="h-6 w-6 text-primary" />
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Performance metrics and trading statistics</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border bg-card">
              <CardContent className="p-6"><Skeleton className="h-12 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Win Rate" value={`${((analytics?.performance?.winRate || 0) * 100).toFixed(1)}%`} icon={Target} />
          <StatCard title="Profit Factor" value={analytics?.performance?.profitFactor?.toFixed(2) || '0.00'} icon={TrendingUp} />
          <StatCard title="Avg Win" value={`$${analytics?.performance?.avgWin?.toFixed(2) || '0.00'}`} icon={DollarSign} valueColor="text-success" />
          <StatCard title="Avg Loss" value={`$${analytics?.performance?.avgLoss?.toFixed(2) || '0.00'}`} icon={DollarSign} valueColor="text-destructive" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase">Daily PnL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {isLoading ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pnlData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="date" stroke="#666" tick={{fill: '#888', fontSize: 12}} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                    <YAxis stroke="#666" tick={{fill: '#888', fontSize: 12}} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111', borderColor: '#333', color: '#fff', fontFamily: 'monospace' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="pnl" fill="#00C087" radius={[2, 2, 0, 0]} >
                      {
                        pnlData.map((entry, index) => (
                          <cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#00C087' : '#FF4757'} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
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
  valueColor = "text-foreground"
}: { 
  title: string; 
  value: string; 
  icon: any;
  valueColor?: string;
}) {
  return (
    <Card className="border-border bg-card/80">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold font-mono tracking-tight ${valueColor}`}>
              {value}
            </p>
          </div>
          <div className="p-3 bg-muted rounded-lg text-muted-foreground">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}