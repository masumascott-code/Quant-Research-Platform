import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Settings, Shield, AlertTriangle, Play, Pause,
  Activity, Zap, Clock, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RiskState {
  isPaused: boolean;
  pauseReason: string | null;
  pauseUntil: string | null;
  consecutiveLosses: number;
  lastTradeAt: string | null;
  cooldownUntil: string | null;
  dailyLossPercent: number;
}

async function fetchSettings() {
  const res = await fetch(`${import.meta.env.BASE_URL}api/admin/settings`);
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json() as Promise<{ settings: Record<string, string> }>;
}

async function fetchRiskState() {
  const res = await fetch(`${import.meta.env.BASE_URL}api/admin/risk-state`);
  if (!res.ok) throw new Error("Failed to fetch risk state");
  return res.json() as Promise<RiskState>;
}

async function saveSettings(settings: Record<string, string>) {
  const res = await fetch(`${import.meta.env.BASE_URL}api/admin/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

async function pauseTrading(reason: string) {
  const res = await fetch(`${import.meta.env.BASE_URL}api/admin/risk/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, durationMinutes: 60 }),
  });
  if (!res.ok) throw new Error("Failed to pause");
  return res.json();
}

async function resumeTrading() {
  const res = await fetch(`${import.meta.env.BASE_URL}api/admin/risk/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to resume");
  return res.json();
}

async function emergencyStop() {
  const res = await fetch(`${import.meta.env.BASE_URL}api/admin/emergency-stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to trigger emergency stop");
  return res.json();
}

export default function Admin() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: fetchSettings,
  });

  const { data: riskState, isLoading: riskLoading } = useQuery({
    queryKey: ["admin-risk"],
    queryFn: fetchRiskState,
    refetchInterval: 10000,
  });

  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsData?.settings) setLocalSettings(settingsData.settings);
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      toast({ title: "Settings saved", description: "Configuration updated successfully." });
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" }),
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseTrading("Manual pause from Admin"),
    onSuccess: () => {
      toast({ title: "Trading paused", description: "No new trades will be opened." });
      qc.invalidateQueries({ queryKey: ["admin-risk"] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: resumeTrading,
    onSuccess: () => {
      toast({ title: "Trading resumed" });
      qc.invalidateQueries({ queryKey: ["admin-risk"] });
    },
  });

  const emergencyMutation = useMutation({
    mutationFn: emergencyStop,
    onSuccess: () => {
      toast({ title: "Emergency Stop Activated", description: "Scanner stopped, trading paused 24h.", variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["admin-risk"] });
    },
  });

  const set = (key: string, value: string) => setLocalSettings(s => ({ ...s, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/20 p-2 rounded-lg">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">System configuration and risk controls</p>
        </div>
      </div>

      {/* Risk Status */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Shield className="h-4 w-4" /> Risk Manager Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {riskLoading ? (
            <div className="text-muted-foreground text-sm animate-pulse">Loading...</div>
          ) : riskState ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${riskState.isPaused ? "bg-red-500 animate-pulse" : "bg-green-500 animate-pulse"}`} />
                  <span className="text-sm font-medium">
                    {riskState.isPaused ? "TRADING PAUSED" : "TRADING ACTIVE"}
                  </span>
                </div>
                <div className="flex gap-2">
                  {riskState.isPaused ? (
                    <Button size="sm" variant="outline" onClick={() => resumeMutation.mutate()} className="text-green-400 border-green-500/30">
                      <Play className="h-3 w-3 mr-1" /> Resume
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => pauseMutation.mutate()} className="text-yellow-400 border-yellow-500/30">
                      <Pause className="h-3 w-3 mr-1" /> Pause
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => emergencyMutation.mutate()}
                    className="bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" /> Emergency Stop
                  </Button>
                </div>
              </div>

              {riskState.isPaused && riskState.pauseReason && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
                  Reason: {riskState.pauseReason}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Consecutive Losses", value: riskState.consecutiveLosses, warn: riskState.consecutiveLosses >= 2 },
                  { label: "Daily Loss %", value: `${riskState.dailyLossPercent.toFixed(2)}%`, warn: riskState.dailyLossPercent >= 2 },
                  {
                    label: "Cooldown",
                    value: riskState.cooldownUntil && new Date(riskState.cooldownUntil) > new Date()
                      ? `${Math.ceil((new Date(riskState.cooldownUntil).getTime() - Date.now()) / 60000)}m`
                      : "None",
                    warn: false
                  },
                  {
                    label: "Last Trade",
                    value: riskState.lastTradeAt ? new Date(riskState.lastTradeAt).toLocaleTimeString() : "None",
                    warn: false
                  },
                ].map(item => (
                  <div key={item.label} className={`rounded-lg p-3 border ${item.warn ? "bg-red-500/10 border-red-500/20" : "bg-muted/30 border-border"}`}>
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className={`text-lg font-bold font-mono ${item.warn ? "text-red-400" : "text-foreground"}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Scanner Settings */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4" /> Scanner Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="text-muted-foreground text-sm animate-pulse">Loading...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { key: "scan_interval_seconds", label: "Scan Interval (seconds)", type: "number", min: 15, max: 300 },
                  { key: "min_score_trade", label: "Min Score to Trade", type: "number", min: 80, max: 100 },
                  { key: "min_score_watchlist", label: "Min Score for Watchlist", type: "number", min: 70, max: 95 },
                  { key: "min_rvol", label: "Min RVOL", type: "number", min: 1.0, max: 5.0 },
                  { key: "max_open_trades", label: "Max Open Trades", type: "number", min: 1, max: 10 },
                  { key: "max_daily_trades", label: "Max Daily Trades", type: "number", min: 1, max: 20 },
                  { key: "max_consecutive_losses", label: "Max Consecutive Losses", type: "number", min: 1, max: 10 },
                  { key: "cooldown_minutes", label: "Cooldown (minutes)", type: "number", min: 5, max: 120 },
                  { key: "risk_pct", label: "Risk % per Trade", type: "number", min: 0.5, max: 5 },
                ].map(({ key, label, type, min, max }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      type={type}
                      min={min}
                      max={max}
                      step={key === "min_rvol" || key === "risk_pct" ? "0.1" : "1"}
                      value={localSettings[key] ?? ""}
                      onChange={e => set(key, e.target.value)}
                      className="bg-muted/30 border-border text-foreground font-mono text-sm h-8"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 pt-2 border-t border-border">
                {[
                  { key: "telegram_enabled", label: "Telegram Alerts" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Switch
                      checked={localSettings[key] === "true"}
                      onCheckedChange={v => set(key, v ? "true" : "false")}
                    />
                    <Label className="text-sm text-muted-foreground">{label}</Label>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => saveMutation.mutate(localSettings)}
                  disabled={saveMutation.isPending}
                  className="bg-primary text-primary-foreground"
                >
                  {saveMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    <><Zap className="h-4 w-4 mr-2" /> Save Settings</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground font-mono text-center py-2">
        Note: Scanner interval and risk settings take effect on the next scan cycle. Restart the server to apply immediately.
      </div>
    </div>
  );
}
