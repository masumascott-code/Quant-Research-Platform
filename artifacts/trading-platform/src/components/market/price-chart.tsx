import { useQuery } from "@tanstack/react-query";
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandleResponse {
  symbol: string;
  interval: string;
  candles: Candle[];
}

export interface PriceChartLevels {
  entryPrice?: number | null;
  stopLoss?: number | null;
  tp1?: number | null;
}

interface PriceChartProps {
  symbol: string;
  direction?: string;
  levels?: PriceChartLevels;
  className?: string;
  compact?: boolean;
}

const chartConfig = {
  close: {
    label: "Close",
    color: "hsl(var(--chart-1))",
  },
  volume: {
    label: "Volume",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

async function fetchCandles(symbol: string) {
  return await apiFetch<CandleResponse>(
    `api/live/candles?symbol=${encodeURIComponent(symbol)}&interval=15m&limit=80`,
  );
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "";
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PriceChart({ symbol, direction, levels, className, compact = false }: PriceChartProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["price-chart", symbol],
    queryFn: () => fetchCandles(symbol),
    enabled: Boolean(symbol),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const candles = data?.candles ?? [];
  const chartData = candles.map((candle) => ({
    ...candle,
    time: formatTime(candle.timestamp),
    isUp: candle.close >= candle.open,
  }));

  const isLong = direction !== "SHORT";
  const closeColor = isLong ? "hsl(var(--success))" : "hsl(var(--destructive))";

  if (isLoading) {
    return (
      <div className={cn("flex h-36 items-center justify-center rounded border border-border/50 bg-muted/20 text-xs text-muted-foreground", className)}>
        Loading chart...
      </div>
    );
  }

  if (isError || chartData.length === 0) {
    return (
      <div className={cn("flex h-36 items-center justify-center rounded border border-border/50 bg-muted/20 text-xs text-muted-foreground", className)}>
        Chart unavailable
      </div>
    );
  }

  return (
    <div className={cn("rounded border border-border/50 bg-muted/10 p-2", className)}>
      <div className="mb-2 flex items-center justify-between text-xs font-mono text-muted-foreground">
        <span>{symbol} 15m</span>
        <span>{chartData.length} candles</span>
      </div>
      <ChartContainer config={chartConfig} className={compact ? "h-32 w-full" : "h-44 w-full"}>
        <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tickLine={false}
            axisLine={false}
            minTickGap={compact ? 28 : 20}
          />
          <YAxis
            dataKey="close"
            domain={["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            width={compact ? 42 : 56}
            tickFormatter={(value) => formatPrice(Number(value))}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value) => (
                  <span className="font-mono text-foreground">{formatPrice(Number(value))}</span>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="close"
            fill={closeColor}
            fillOpacity={0.1}
            stroke="none"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke={closeColor}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {levels?.entryPrice ? (
            <ReferenceLine y={levels.entryPrice} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
          ) : null}
          {levels?.stopLoss ? (
            <ReferenceLine y={levels.stopLoss} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
          ) : null}
          {levels?.tp1 ? (
            <ReferenceLine y={levels.tp1} stroke="hsl(var(--success))" strokeDasharray="4 4" />
          ) : null}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
