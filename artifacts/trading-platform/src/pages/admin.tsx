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
  Activity, Zap, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";

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
  return await apiFetch<{ settings: Record<string, string> }>("api/admin/settings");
}

async function fetchRiskState() {
  return await apiFetch<RiskState>("api/admin/risk-state");
}

async function saveSettings(settings: Record<string, string>) {
  return await apiFetch("api/admin/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: canonicalSettings(settings) }),
  });
}

async function pauseTrading(reason: string) {
  return await apiFetch("api/admin/risk/pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, durationMinutes: 60 }),
  });
}

async function resumeTrading() {
  return await apiFetch("api/admin/risk/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

async function emergencyStop() {
  return await apiFetch("api/admin/emergency-stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

const FEATURED_SETTING_KEYS = [
  "scanner.minScoreTrade",
  "scanner.minScoreWatchlist",
  "scanner.minRvol",
  "scanner.maxOpenTrades",
  "scanner.maxDailyTrades",
  "scanner.maxWeeklyTrades",
  "paperTrading.fixedTradeNotional",
  "risk.riskPercent",
  "risk.cooldownMinutes",
  "risk.maxConsecutiveLosses",
  "notifications.telegramEnabled",
] as const;

function settingLabel(key: string) {
  const labels: Record<string, string> = {
    "scanner.minScoreTrade": "Min Score to Paper Trade",
    "scanner.minScoreWatchlist": "Min Score for Watchlist",
    "scanner.scanIntervalMs": "Scan Interval (ms)",
    "scanner.minRvol": "Min RVOL",
    "paperTrading.fixedTradeNotional": "Trade Size (USDT)",
    "risk.riskPercent": "Risk % per Trade",
    "risk.cooldownMinutes": "Cooldown (minutes)",
    "risk.maxConsecutiveLosses": "Max Consecutive Losses",
    "notifications.telegramEnabled": "Telegram Alerts",
  };
  if (labels[key]) return labels[key];
  const raw = key.split(".").at(-1) ?? key;
  return raw.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function sectionLabel(section: string) {
  return section.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function isBooleanSetting(value: string) {
  return value === "true" || value === "false";
}

function inputStep(key: string) {
  return /(rate|ratio|percent|rvol|temperature|tolerance|weight|score)/i.test(key) ? "0.1" : "1";
}

function canonicalEntries(settings: Record<string, string>) {
  return Object.entries(settings)
    .filter(([key]) => key.includes("."))
    .sort(([a], [b]) => a.localeCompare(b));
}

function canonicalSettings(settings: Record<string, string>) {
  return Object.fromEntries(canonicalEntries(settings));
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
    onError: (error) => toast({
      title: "Error",
      description: error instanceof Error ? error.message : "Failed to save settings.",
      variant: "destructive",
    }),
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
  const settingsEntries = canonicalEntries(localSettings);
  const featuredEntries = FEATURED_SETTING_KEYS
    .filter((key) => key in localSettings)
    .map((key) => [key, localSettings[key]] as [string, string]);
  const featuredKeySet = new Set(FEATURED_SETTING_KEYS);
  const groupedSettings = settingsEntries
    .filter(([key]) => !featuredKeySet.has(key as typeof FEATURED_SETTING_KEYS[number]))
    .reduce<Record<string, Array<[string, string]>>>((groups, entry) => {
      const [section] = entry[0].split(".");
      groups[section] = groups[section] ?? [];
      groups[section].push(entry);
      return groups;
    }, {});

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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${riskState.isPaused ? "bg-red-500 animate-pulse" : "bg-green-500 animate-pulse"}`} />
                  <span className="text-sm font-medium">
                    {riskState.isPaused ? "TRADING PAUSED" : "TRADING ACTIVE"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {featuredEntries.map(([key, value]) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{settingLabel(key)}</Label>
                    {isBooleanSetting(value) ? (
                      <div className="flex h-8 items-center gap-2 rounded border border-border bg-muted/30 px-3">
                        <Switch
                          checked={value === "true"}
                          onCheckedChange={checked => set(key, checked ? "true" : "false")}
                        />
                        <span className="text-xs font-mono text-muted-foreground">{value === "true" ? "Enabled" : "Disabled"}</span>
                      </div>
                    ) : (
                      <Input
                        type={Number.isFinite(Number(value)) && value.trim() !== "" ? "number" : "text"}
                        step={inputStep(key)}
                        value={localSettings[key] ?? ""}
                        onChange={e => set(key, e.target.value)}
                        className="bg-muted/30 border-border text-foreground font-mono text-sm h-8"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-5 border-t border-border pt-5">
                {Object.entries(groupedSettings).map(([section, entries]) => (
                  <div key={section} className="space-y-3">
                    <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      {sectionLabel(section)}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {entries.map(([key, value]) => (
                        <div key={key} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{settingLabel(key)}</Label>
                          {isBooleanSetting(value) ? (
                            <div className="flex h-8 items-center gap-2 rounded border border-border bg-muted/30 px-3">
                              <Switch
                                checked={value === "true"}
                                onCheckedChange={checked => set(key, checked ? "true" : "false")}
                              />
                              <span className="text-xs font-mono text-muted-foreground">{value === "true" ? "Enabled" : "Disabled"}</span>
                            </div>
                          ) : (
                            <Input
                              type={Number.isFinite(Number(value)) && value.trim() !== "" ? "number" : "text"}
                              step={inputStep(key)}
                              value={localSettings[key] ?? ""}
                              onChange={e => set(key, e.target.value)}
                              className="bg-muted/30 border-border text-foreground font-mono text-sm h-8"
                            />
                          )}
                          <div className="truncate text-[10px] font-mono text-muted-foreground/70">{key}</div>
                        </div>
                      ))}
                    </div>
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
        Note: Saved runtime settings reload on the API immediately; active scanner decisions use them on the next scan cycle.
      </div>
    </div>
  );
}
