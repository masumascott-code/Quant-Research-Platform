import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, Shield, AlertTriangle, Play, Pause,
  Activity, Zap, RefreshCw, Users, UserCheck, UserX
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ApiError, apiFetch } from "@/lib/api-fetch";

interface RiskState {
  isPaused: boolean;
  pauseReason: string | null;
  pauseUntil: string | null;
  consecutiveLosses: number;
  lastTradeAt: string | null;
  cooldownUntil: string | null;
  dailyLossPercent: number;
}

type RegisteredUserStatus = "pending" | "active" | "disabled" | "all";

interface RegisteredUser {
  id: number;
  email: string;
  username: string;
  role: "admin" | "viewer";
  status: Exclude<RegisteredUserStatus, "all">;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  lastLoginAt: string | null;
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

async function fetchAdminUsers(status: RegisteredUserStatus) {
  const query = new URLSearchParams({ status, limit: "50" });
  return await apiFetch<{ users: RegisteredUser[] }>(`api/admin/users?${query.toString()}`);
}

async function approveAdminUser(id: number) {
  return await apiFetch<{ user: RegisteredUser }>(`api/admin/users/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

async function disableAdminUser(id: number) {
  return await apiFetch<{ user: RegisteredUser }>(`api/admin/users/${id}/disable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

const AI_SETTING_KEYS = [
  "ai.enabled",
  "ai.modelName",
  "ai.temperature",
  "ai.maxTokens",
  "ai.timeoutMs",
  "ai.retryCount",
  "ai.retryDelayMs",
  "ai.cacheTtlMs",
  "ai.rateLimitPerMinute",
] as const;

const SETTINGS_SECTIONS = [
  {
    id: "ai",
    title: "AI Settings",
    description: "Model, generation, retry, cache, and rate-limit controls.",
    keys: AI_SETTING_KEYS,
  },
  {
    id: "scanner",
    title: "Scanner Settings",
    description: "Market scan cadence, universe sizing, liquidity filters, and trade limits.",
    prefixes: ["scanner."],
  },
  {
    id: "risk",
    title: "Risk Settings",
    description: "Risk limits, exposure controls, drawdown protection, and kill switch.",
    prefixes: ["risk."],
  },
  {
    id: "signal",
    title: "Signal Settings",
    description: "Indicator periods, scoring thresholds, structure, volume, and RR rules.",
    prefixes: ["signal."],
  },
  {
    id: "paperTrading",
    title: "Paper Trading Settings",
    description: "Paper account, leverage, sizing, fees, slippage, and funding assumptions.",
    prefixes: ["paperTrading."],
  },
  {
    id: "priceTracker",
    title: "Price Tracker Settings",
    description: "Price polling, symbol refresh, and external price API timing.",
    prefixes: ["priceTracker."],
  },
  {
    id: "slMonitor",
    title: "Stop Loss / SL Monitor Settings",
    description: "Stop-loss and take-profit monitor runtime timing.",
    prefixes: ["slMonitor."],
  },
  {
    id: "notifications",
    title: "Notifications Settings",
    description: "Notification delivery switches and runtime alert behavior.",
    prefixes: ["notifications."],
  },
  {
    id: "advanced",
    title: "Other / Advanced Settings",
    description: "Advanced runtime knobs not covered by the primary sections.",
  },
] as const;

const PRIMARY_SETTING_KEYS = [
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
    "scanner.maxOpenTrades": "Max Open Trades",
    "scanner.maxDailyTrades": "Max Daily Trades",
    "scanner.maxWeeklyTrades": "Max Weekly Trades",
    "paperTrading.fixedTradeNotional": "Trade Size (USDT)",
    "risk.riskPercent": "Risk % per Trade",
    "risk.cooldownMinutes": "Cooldown (minutes)",
    "risk.maxConsecutiveLosses": "Max Consecutive Losses",
    "ai.enabled": "AI Enabled",
    "ai.modelName": "Model Name",
    "ai.temperature": "Temperature",
    "ai.maxTokens": "Max Tokens",
    "ai.timeoutMs": "Timeout (ms)",
    "ai.retryCount": "Retry Count",
    "ai.retryDelayMs": "Retry Delay (ms)",
    "ai.cacheTtlMs": "Cache TTL (ms)",
    "ai.rateLimitPerMinute": "Rate Limit / Minute",
    "notifications.telegramEnabled": "Telegram Alerts",
  };
  if (labels[key]) return labels[key];
  const raw = key.split(".").at(-1) ?? key;
  return raw.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
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

type SettingsEntry = [string, string];

function sectionOwnsKey(section: typeof SETTINGS_SECTIONS[number], key: string) {
  if ("keys" in section && section.keys.some((candidate) => candidate === key)) return true;
  if ("prefixes" in section && section.prefixes.some((prefix) => key.startsWith(prefix))) return true;
  return false;
}

function buildSettingsSections(entries: SettingsEntry[]) {
  const assignedKeys = new Set<string>();

  const sections = SETTINGS_SECTIONS.map((section) => {
    if (section.id === "advanced") {
      const advancedEntries = entries.filter(([key]) => !assignedKeys.has(key));
      return { ...section, entries: advancedEntries };
    }

    const sectionEntries = entries.filter(([key]) => sectionOwnsKey(section, key));
    sectionEntries.forEach(([key]) => assignedKeys.add(key));
    return { ...section, entries: sectionEntries };
  });

  return sections.filter((section) => section.entries.length > 0 || section.id === "ai");
}

function SettingField({
  settingKey,
  value,
  onChange,
}: {
  settingKey: string;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{settingLabel(settingKey)}</Label>
      {isBooleanSetting(value) ? (
        <div className="flex h-8 items-center gap-2 rounded border border-border bg-muted/30 px-3">
          <Switch
            checked={value === "true"}
            onCheckedChange={checked => onChange(settingKey, checked ? "true" : "false")}
          />
          <span className="text-xs font-mono text-muted-foreground">{value === "true" ? "Enabled" : "Disabled"}</span>
        </div>
      ) : (
        <Input
          type={Number.isFinite(Number(value)) && value.trim() !== "" ? "number" : "text"}
          step={inputStep(settingKey)}
          value={value}
          onChange={e => onChange(settingKey, e.target.value)}
          className="bg-muted/30 border-border text-foreground font-mono text-sm h-8"
        />
      )}
      <div className="truncate text-[10px] font-mono text-muted-foreground/70">{settingKey}</div>
    </div>
  );
}

function SaveSettingsButton({
  isPending,
  onSave,
  className = "",
}: {
  isPending: boolean;
  onSave: () => void;
  className?: string;
}) {
  return (
    <Button
      onClick={onSave}
      disabled={isPending}
      className={`bg-primary text-primary-foreground ${className}`}
    >
      {isPending ? (
        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
      ) : (
        <><Zap className="h-4 w-4 mr-2" /> Save Settings</>
      )}
    </Button>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function userStatusClass(status: RegisteredUser["status"]) {
  if (status === "active") return "border-green-500/30 bg-green-500/10 text-green-400";
  if (status === "disabled") return "border-red-500/30 bg-red-500/10 text-red-400";
  return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";
}

function userErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "Admin permission is required to manage users.";
    if (error.status === 404) return "User not found.";
    if (error.status === 503) return "User management is temporarily unavailable.";
  }

  return "User management request failed. Please try again.";
}

function UserManagementCard({
  users,
  loading,
  error,
  selectedStatus,
  onStatusChange,
  onRefresh,
  onApprove,
  onDisable,
  approvingId,
  disablingId,
  refreshing,
}: {
  users: RegisteredUser[];
  loading: boolean;
  error: unknown;
  selectedStatus: RegisteredUserStatus;
  onStatusChange: (status: RegisteredUserStatus) => void;
  onRefresh: () => void;
  onApprove: (id: number) => void;
  onDisable: (id: number) => void;
  approvingId: number | null;
  disablingId: number | null;
  refreshing: boolean;
}) {
  const statuses: RegisteredUserStatus[] = ["pending", "active", "disabled", "all"];

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Users className="h-4 w-4" /> Registered Users
          </CardTitle>
          <p className="text-xs text-muted-foreground">Manage registered users and approval status.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid grid-cols-2 gap-1 sm:flex">
            {statuses.map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={selectedStatus === status ? "default" : "outline"}
                onClick={() => onStatusChange(status)}
                className="h-8 text-xs capitalize"
              >
                {status}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {userErrorMessage(error)}
          </div>
        ) : loading ? (
          <div className="text-muted-foreground text-sm animate-pulse">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
            No registered users found for this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user) => {
              const approvePending = approvingId === user.id;
              const disablePending = disablingId === user.id;
              return (
                <div key={user.id} className="rounded-md border border-border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all font-mono text-base font-semibold text-foreground">{user.username}</span>
                        <Badge variant="outline" className={`font-mono text-[10px] uppercase ${userStatusClass(user.status)}`}>
                          {user.status}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {user.role}
                        </Badge>
                      </div>
                      <div className="break-all text-sm text-muted-foreground">{user.email}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(user.status === "pending" || user.status === "disabled") && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onApprove(user.id)}
                          disabled={approvePending || disablePending}
                          className="h-8"
                        >
                          <UserCheck className={`h-3.5 w-3.5 mr-1 ${approvePending ? "animate-pulse" : ""}`} />
                          {approvePending ? "Approving..." : "Approve"}
                        </Button>
                      )}
                      {(user.status === "active" || user.status === "pending") && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onDisable(user.id)}
                          disabled={approvePending || disablePending}
                          className="h-8 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        >
                          <UserX className={`h-3.5 w-3.5 mr-1 ${disablePending ? "animate-pulse" : ""}`} />
                          {disablePending ? "Disabling..." : "Disable"}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <UserMeta label="Created" value={formatDate(user.createdAt)} />
                    <UserMeta label="Approved" value={formatDate(user.approvedAt)} />
                    <UserMeta label="Approved By" value={user.approvedBy ?? "—"} />
                    <UserMeta label="Last Login" value={formatDate(user.lastLoginAt)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UserMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card/60 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-mono text-foreground">{value}</div>
    </div>
  );
}

export default function Admin() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [userStatusFilter, setUserStatusFilter] = useState<RegisteredUserStatus>("pending");

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: fetchSettings,
  });

  const { data: riskState, isLoading: riskLoading } = useQuery({
    queryKey: ["admin-risk"],
    queryFn: fetchRiskState,
    refetchInterval: 10000,
  });

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
    isFetching: usersFetching,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["admin-users", userStatusFilter],
    queryFn: () => fetchAdminUsers(userStatusFilter),
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

  const approveUserMutation = useMutation({
    mutationFn: approveAdminUser,
    onSuccess: () => {
      toast({ title: "User approved", description: "The user can sign in after approval." });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => toast({
      title: "Approval failed",
      description: userErrorMessage(error),
      variant: "destructive",
    }),
  });

  const disableUserMutation = useMutation({
    mutationFn: disableAdminUser,
    onSuccess: () => {
      toast({ title: "User disabled", description: "The user can no longer sign in with this account." });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => toast({
      title: "Disable failed",
      description: userErrorMessage(error),
      variant: "destructive",
    }),
  });

  const set = (key: string, value: string) => setLocalSettings(s => ({ ...s, [key]: value }));
  const settingsEntries = canonicalEntries(localSettings);
  const primaryEntries = PRIMARY_SETTING_KEYS
    .filter((key) => key in localSettings)
    .map((key) => [key, localSettings[key]] as [string, string]);
  const runtimeSections = buildSettingsSections(settingsEntries);
  const saveCurrentSettings = () => saveMutation.mutate(localSettings);
  const approvingId = approveUserMutation.isPending ? approveUserMutation.variables ?? null : null;
  const disablingId = disableUserMutation.isPending ? disableUserMutation.variables ?? null : null;
  const handleDisableUser = (id: number) => {
    if (!window.confirm("Disable this registered user? They will not be able to sign in.")) return;
    disableUserMutation.mutate(id);
  };

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

      <UserManagementCard
        users={usersData?.users ?? []}
        loading={usersLoading}
        error={usersError}
        selectedStatus={userStatusFilter}
        onStatusChange={setUserStatusFilter}
        onRefresh={() => refetchUsers()}
        onApprove={(id) => approveUserMutation.mutate(id)}
        onDisable={handleDisableUser}
        approvingId={approvingId}
        disablingId={disablingId}
        refreshing={usersFetching}
      />

      {/* Runtime Settings */}
      <Card className="bg-card border border-border">
        <CardHeader className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Activity className="h-4 w-4" /> Runtime Configuration
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Canonical runtime settings grouped by subsystem. Changes save as dotted keys.
            </p>
          </div>
          {!settingsLoading && (
            <SaveSettingsButton
              isPending={saveMutation.isPending}
              onSave={saveCurrentSettings}
              className="w-full md:w-auto"
            />
          )}
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="text-muted-foreground text-sm animate-pulse">Loading...</div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Primary Controls</h3>
                  <Badge variant="outline" className="font-mono text-[10px]">{primaryEntries.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {primaryEntries.map(([key, value]) => (
                    <SettingField key={key} settingKey={key} value={value} onChange={set} />
                  ))}
                </div>
              </div>

              <Tabs defaultValue="ai" className="space-y-5 border-t border-border pt-5">
                <div className="overflow-x-auto pb-1">
                  <TabsList className="h-auto w-max justify-start gap-1 rounded-md">
                    {runtimeSections.map((section) => (
                      <TabsTrigger key={section.id} value={section.id} className="text-xs">
                        {section.title}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {runtimeSections.map((section) => (
                  <TabsContent key={section.id} value={section.id} className="mt-0">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
                        </div>
                        <Badge variant="outline" className="w-fit font-mono text-[10px]">
                          {section.entries.length} keys
                        </Badge>
                      </div>

                      {section.entries.length === 0 ? (
                        <div className="rounded border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                          No canonical settings returned for this section.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {section.entries.map(([key, value]) => (
                            <SettingField key={key} settingKey={key} value={value} onChange={set} />
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>

              <div className="flex justify-end pt-2">
                <SaveSettingsButton
                  isPending={saveMutation.isPending}
                  onSave={saveCurrentSettings}
                  className="w-full sm:w-auto"
                />
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
