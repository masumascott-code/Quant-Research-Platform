import { DEFAULT_RUNTIME_CONFIG } from "./defaults";
import type { FlatRuntimeConfig, RuntimeConfig, RuntimeConfigValue } from "./types";

type ConfigPath =
  | "scanner.binanceBaseUrl"
  | "scanner.scanIntervalMs"
  | "scanner.minVolume24h"
  | "scanner.minRvol"
  | "scanner.topListSize"
  | "scanner.analysisListSize"
  | "scanner.symbolCooldownMs"
  | "scanner.watchlistCheckCooldownMs"
  | "scanner.excludedSymbolPrefixes"
  | "scanner.quoteAsset"
  | "scanner.candles15mLimit"
  | "scanner.candles5mLimit"
  | "scanner.candlesH1Limit"
  | "scanner.minCandles15m"
  | "scanner.volumeLookback"
  | "scanner.snapshotRvolFallback"
  | "scanner.signalTtlMs"
  | "scanner.watchlistTtlMs"
  | "scanner.snapshotFreshnessWindowMs"
  | "scanner.minScoreTrade"
  | "scanner.minScoreWatchlist"
  | "scanner.maxOpenTrades"
  | "scanner.maxDailyTrades"
  | "scanner.maxWeeklyTrades"
  | "signal.emaFastPeriod"
  | "signal.emaSlowPeriod"
  | "signal.emaTrendPeriod"
  | "signal.atrPeriod"
  | "signal.rvolLookback"
  | "signal.minCandles15m"
  | "signal.structureLookback"
  | "signal.breakoutLookback"
  | "signal.retestTolerance"
  | "signal.setupRetestTolerance"
  | "signal.fakeoutWickRatio"
  | "signal.fakeoutVolumeRatio"
  | "signal.candleBodyRatio"
  | "signal.momentumCandles"
  | "signal.mtfMinCandles"
  | "signal.minTimeframeAlignment"
  | "signal.timeframeScoreMultiplier"
  | "signal.minAnalysisScore"
  | "signal.maxScore"
  | "signal.volumeExpansionRvol"
  | "signal.emaPullbackTolerance"
  | "signal.supportResistanceTolerance"
  | "signal.supportResistanceLookback"
  | "signal.supportResistanceBaseLookback"
  | "signal.swingLookback"
  | "signal.atrSwingBuffer"
  | "signal.atrEmaBuffer"
  | "signal.atrMaxStopBuffer"
  | "signal.maxRiskPercent"
  | "signal.tp1RiskMultiple"
  | "signal.tp2RiskMultiple"
  | "signal.tp3RiskMultiple"
  | "signal.minRrRatio"
  | "signal.gradeAPlusScore"
  | "signal.confidenceExtremeScore"
  | "signal.confidenceVeryHighScore"
  | "signal.confidenceHighScore"
  | "signal.confidenceMediumScore"
  | "signal.volumeScoreVeryHigh"
  | "signal.volumeScoreHigh"
  | "signal.volumeScoreMedium"
  | "signal.volumeScoreMin"
  | "signal.rvolScoreExtreme"
  | "signal.rvolScoreVeryHigh"
  | "signal.rvolScoreHigh"
  | "signal.rvolScoreMediumHigh"
  | "signal.rvolScoreMin"
  | "risk.riskPercent"
  | "risk.cooldownMinutes"
  | "risk.maxConsecutiveLosses"
  | "risk.pauseAfterLossesMinutes"
  | "risk.dailyDrawdownLimitPercent"
  | "risk.maxDrawdownPercent"
  | "risk.emergencyPauseMinutes"
  | "risk.manualPauseDefaultMinutes"
  | "risk.recentLossLookback"
  | "risk.maxExposurePercent"
  | "risk.maxPortfolioRiskPercent"
  | "risk.maxAccountRiskPercent"
  | "risk.maxSectorExposurePercent"
  | "risk.maxCoinExposurePercent"
  | "risk.autoLossLimitsEnabled"
  | "risk.killSwitch"
  | "paperTrading.defaultEquity"
  | "paperTrading.defaultLeverage"
  | "paperTrading.fixedTradeNotional"
  | "paperTrading.tradingFeeRate"
  | "paperTrading.makerFeeRate"
  | "paperTrading.takerFeeRate"
  | "paperTrading.commissionRate"
  | "paperTrading.slippageRate"
  | "paperTrading.fundingRate"
  | "paperTrading.fundingIntervalHours"
  | "paperTrading.defaultQuantity"
  | "paperTrading.breakEvenPnlThreshold"
  | "priceTracker.binanceBaseUrl"
  | "priceTracker.pollIntervalMs"
  | "priceTracker.symbolRefreshMs"
  | "priceTracker.fetchTimeoutMs"
  | "slMonitor.checkIntervalMs"
  | "scannerDecision.technicalWeight"
  | "scannerDecision.marketRegimeWeight"
  | "scannerDecision.liquidityWeight"
  | "scannerDecision.volumeWeight"
  | "scannerDecision.trendWeight"
  | "scannerDecision.volatilityWeight"
  | "scannerDecision.sessionWeight"
  | "scannerDecision.riskRewardWeight"
  | "scannerDecision.minConfidence"
  | "scannerDecision.minLiquidityScore"
  | "scannerDecision.minSessionQuality"
  | "scannerDecision.minVolatilityScore"
  | "scannerDecision.maxVolatilityScore"
  | "scannerDecision.maxRiskGrade"
  | "scannerDecision.gradeAPlusThreshold"
  | "scannerDecision.gradeAThreshold"
  | "scannerDecision.gradeBThreshold"
  | "scannerDecision.strategyTrendingBull"
  | "scannerDecision.strategyTrendingBear"
  | "scannerDecision.strategySideways"
  | "scannerDecision.strategyVolatile"
  | "scannerDecision.strategyCompression"
  | "scannerDecision.strategyExpansion"
  | "ai.enabled"
  | "ai.modelName"
  | "ai.temperature"
  | "ai.maxTokens"
  | "ai.timeoutMs"
  | "ai.retryCount"
  | "ai.retryDelayMs"
  | "ai.cacheTtlMs"
  | "ai.rateLimitPerMinute"
  | "notifications.telegramEnabled";

type ValueKind = "string" | "number" | "boolean" | "stringArray";
type RawValueValidationIssue = {
  rawKey: string;
  message: string;
};

const TRUE_BOOLEAN_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_BOOLEAN_VALUES = new Set(["0", "false", "no", "off"]);

const CONFIG_VALUE_KINDS: Record<ConfigPath, ValueKind> = {
  "scanner.binanceBaseUrl": "string",
  "scanner.scanIntervalMs": "number",
  "scanner.minVolume24h": "number",
  "scanner.minRvol": "number",
  "scanner.topListSize": "number",
  "scanner.analysisListSize": "number",
  "scanner.symbolCooldownMs": "number",
  "scanner.watchlistCheckCooldownMs": "number",
  "scanner.excludedSymbolPrefixes": "stringArray",
  "scanner.quoteAsset": "string",
  "scanner.candles15mLimit": "number",
  "scanner.candles5mLimit": "number",
  "scanner.candlesH1Limit": "number",
  "scanner.minCandles15m": "number",
  "scanner.volumeLookback": "number",
  "scanner.snapshotRvolFallback": "number",
  "scanner.signalTtlMs": "number",
  "scanner.watchlistTtlMs": "number",
  "scanner.snapshotFreshnessWindowMs": "number",
  "scanner.minScoreTrade": "number",
  "scanner.minScoreWatchlist": "number",
  "scanner.maxOpenTrades": "number",
  "scanner.maxDailyTrades": "number",
  "scanner.maxWeeklyTrades": "number",
  "signal.emaFastPeriod": "number",
  "signal.emaSlowPeriod": "number",
  "signal.emaTrendPeriod": "number",
  "signal.atrPeriod": "number",
  "signal.rvolLookback": "number",
  "signal.minCandles15m": "number",
  "signal.structureLookback": "number",
  "signal.breakoutLookback": "number",
  "signal.retestTolerance": "number",
  "signal.setupRetestTolerance": "number",
  "signal.fakeoutWickRatio": "number",
  "signal.fakeoutVolumeRatio": "number",
  "signal.candleBodyRatio": "number",
  "signal.momentumCandles": "number",
  "signal.mtfMinCandles": "number",
  "signal.minTimeframeAlignment": "number",
  "signal.timeframeScoreMultiplier": "number",
  "signal.minAnalysisScore": "number",
  "signal.maxScore": "number",
  "signal.volumeExpansionRvol": "number",
  "signal.emaPullbackTolerance": "number",
  "signal.supportResistanceTolerance": "number",
  "signal.supportResistanceLookback": "number",
  "signal.supportResistanceBaseLookback": "number",
  "signal.swingLookback": "number",
  "signal.atrSwingBuffer": "number",
  "signal.atrEmaBuffer": "number",
  "signal.atrMaxStopBuffer": "number",
  "signal.maxRiskPercent": "number",
  "signal.tp1RiskMultiple": "number",
  "signal.tp2RiskMultiple": "number",
  "signal.tp3RiskMultiple": "number",
  "signal.minRrRatio": "number",
  "signal.gradeAPlusScore": "number",
  "signal.confidenceExtremeScore": "number",
  "signal.confidenceVeryHighScore": "number",
  "signal.confidenceHighScore": "number",
  "signal.confidenceMediumScore": "number",
  "signal.volumeScoreVeryHigh": "number",
  "signal.volumeScoreHigh": "number",
  "signal.volumeScoreMedium": "number",
  "signal.volumeScoreMin": "number",
  "signal.rvolScoreExtreme": "number",
  "signal.rvolScoreVeryHigh": "number",
  "signal.rvolScoreHigh": "number",
  "signal.rvolScoreMediumHigh": "number",
  "signal.rvolScoreMin": "number",
  "risk.riskPercent": "number",
  "risk.cooldownMinutes": "number",
  "risk.maxConsecutiveLosses": "number",
  "risk.pauseAfterLossesMinutes": "number",
  "risk.dailyDrawdownLimitPercent": "number",
  "risk.maxDrawdownPercent": "number",
  "risk.emergencyPauseMinutes": "number",
  "risk.manualPauseDefaultMinutes": "number",
  "risk.recentLossLookback": "number",
  "risk.maxExposurePercent": "number",
  "risk.maxPortfolioRiskPercent": "number",
  "risk.maxAccountRiskPercent": "number",
  "risk.maxSectorExposurePercent": "number",
  "risk.maxCoinExposurePercent": "number",
  "risk.autoLossLimitsEnabled": "boolean",
  "risk.killSwitch": "boolean",
  "paperTrading.defaultEquity": "number",
  "paperTrading.defaultLeverage": "number",
  "paperTrading.fixedTradeNotional": "number",
  "paperTrading.tradingFeeRate": "number",
  "paperTrading.makerFeeRate": "number",
  "paperTrading.takerFeeRate": "number",
  "paperTrading.commissionRate": "number",
  "paperTrading.slippageRate": "number",
  "paperTrading.fundingRate": "number",
  "paperTrading.fundingIntervalHours": "number",
  "paperTrading.defaultQuantity": "number",
  "paperTrading.breakEvenPnlThreshold": "number",
  "priceTracker.binanceBaseUrl": "string",
  "priceTracker.pollIntervalMs": "number",
  "priceTracker.symbolRefreshMs": "number",
  "priceTracker.fetchTimeoutMs": "number",
  "slMonitor.checkIntervalMs": "number",
  "scannerDecision.technicalWeight": "number",
  "scannerDecision.marketRegimeWeight": "number",
  "scannerDecision.liquidityWeight": "number",
  "scannerDecision.volumeWeight": "number",
  "scannerDecision.trendWeight": "number",
  "scannerDecision.volatilityWeight": "number",
  "scannerDecision.sessionWeight": "number",
  "scannerDecision.riskRewardWeight": "number",
  "scannerDecision.minConfidence": "number",
  "scannerDecision.minLiquidityScore": "number",
  "scannerDecision.minSessionQuality": "number",
  "scannerDecision.minVolatilityScore": "number",
  "scannerDecision.maxVolatilityScore": "number",
  "scannerDecision.maxRiskGrade": "string",
  "scannerDecision.gradeAPlusThreshold": "number",
  "scannerDecision.gradeAThreshold": "number",
  "scannerDecision.gradeBThreshold": "number",
  "scannerDecision.strategyTrendingBull": "string",
  "scannerDecision.strategyTrendingBear": "string",
  "scannerDecision.strategySideways": "string",
  "scannerDecision.strategyVolatile": "string",
  "scannerDecision.strategyCompression": "string",
  "scannerDecision.strategyExpansion": "string",
  "ai.enabled": "boolean",
  "ai.modelName": "string",
  "ai.temperature": "number",
  "ai.maxTokens": "number",
  "ai.timeoutMs": "number",
  "ai.retryCount": "number",
  "ai.retryDelayMs": "number",
  "ai.cacheTtlMs": "number",
  "ai.rateLimitPerMinute": "number",
  "notifications.telegramEnabled": "boolean",
};

export const LEGACY_CONFIG_ALIASES: Record<string, ConfigPath> = {
  scan_interval_seconds: "scanner.scanIntervalMs",
  min_score_trade: "scanner.minScoreTrade",
  min_score_watchlist: "scanner.minScoreWatchlist",
  min_rvol: "scanner.minRvol",
  risk_pct: "risk.riskPercent",
  cooldown_minutes: "risk.cooldownMinutes",
  max_open_trades: "scanner.maxOpenTrades",
  max_daily_trades: "scanner.maxDailyTrades",
  max_consecutive_losses: "risk.maxConsecutiveLosses",
  max_daily_loss: "risk.dailyDrawdownLimitPercent",
  max_daily_drawdown: "risk.dailyDrawdownLimitPercent",
  max_drawdown: "risk.maxDrawdownPercent",
  max_exposure: "risk.maxExposurePercent",
  max_portfolio_risk: "risk.maxPortfolioRiskPercent",
  max_account_risk: "risk.maxAccountRiskPercent",
  max_sector_exposure: "risk.maxSectorExposurePercent",
  max_coin_exposure: "risk.maxCoinExposurePercent",
  auto_loss_limits_enabled: "risk.autoLossLimitsEnabled",
  rr_ratio: "signal.minRrRatio",
  kill_switch: "risk.killSwitch",
  emergency_stop: "risk.killSwitch",
  default_equity: "paperTrading.defaultEquity",
  default_leverage: "paperTrading.defaultLeverage",
  fixed_trade_notional: "paperTrading.fixedTradeNotional",
  trading_fees: "paperTrading.tradingFeeRate",
  maker_fee: "paperTrading.makerFeeRate",
  taker_fee: "paperTrading.takerFeeRate",
  commission: "paperTrading.commissionRate",
  slippage: "paperTrading.slippageRate",
  funding: "paperTrading.fundingRate",
  funding_interval_hours: "paperTrading.fundingIntervalHours",
  ai_enabled: "ai.enabled",
  ai_model_name: "ai.modelName",
  ai_temperature: "ai.temperature",
  ai_max_tokens: "ai.maxTokens",
  ai_timeout_ms: "ai.timeoutMs",
  ai_retry_count: "ai.retryCount",
  telegram_enabled: "notifications.telegramEnabled",
};

function cloneDefaultConfig(): RuntimeConfig {
  return JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG)) as RuntimeConfig;
}

function envKey(path: string): string {
  return `QE_${path.replace(/\./g, "_").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

function coerceValue(raw: string, kind: ValueKind): RuntimeConfigValue | null {
  switch (kind) {
    case "string":
      return raw;
    case "number": {
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    }
    case "boolean":
      return TRUE_BOOLEAN_VALUES.has(raw.trim().toLowerCase());
    case "stringArray":
      return raw.split(",").map((value) => value.trim()).filter(Boolean);
  }
}

function expectedValueDescription(kind: ValueKind): string {
  switch (kind) {
    case "number":
      return "finite number";
    case "boolean":
      return "boolean (true/false, 1/0, yes/no, or on/off)";
    case "stringArray":
      return "comma-separated string list";
    case "string":
      return "string";
  }
}

function isValidRawValue(raw: string, kind: ValueKind): boolean {
  switch (kind) {
    case "number":
      return Number.isFinite(Number(raw));
    case "boolean": {
      const normalized = raw.trim().toLowerCase();
      return TRUE_BOOLEAN_VALUES.has(normalized) || FALSE_BOOLEAN_VALUES.has(normalized);
    }
    case "string":
    case "stringArray":
      return true;
  }
}

function setPath(config: RuntimeConfig, path: ConfigPath, value: RuntimeConfigValue): void {
  const [section, key] = path.split(".") as [keyof RuntimeConfig, string];
  (config[section] as unknown as Record<string, RuntimeConfigValue>)[key] = value;
}

function getPath(config: RuntimeConfig, path: ConfigPath): RuntimeConfigValue {
  const [section, key] = path.split(".") as [keyof RuntimeConfig, string];
  return (config[section] as unknown as Record<string, RuntimeConfigValue>)[key];
}

function parseRawValuesWithoutValidation(rawValues: Record<string, string | undefined>): RuntimeConfig {
  const config = cloneDefaultConfig();

  for (const [rawKey, rawValue] of Object.entries(rawValues)) {
    if (rawValue == null || rawValue.trim() === "") continue;
    const normalized = ConfigurationValidator.normalizeEntry(rawKey, rawValue);
    if (!normalized) continue;
    const { key } = normalized;
    const kind = CONFIG_VALUE_KINDS[key];
    const value = coerceValue(normalized.value, kind);
    if (value == null) continue;
    setPath(config, key, value);
  }

  return config;
}

export class ConfigurationValidator {
  static canonicalKeys(): ConfigPath[] {
    return Object.keys(CONFIG_VALUE_KINDS) as ConfigPath[];
  }

  static envKeyFor(path: ConfigPath): string {
    return envKey(path);
  }

  static normalizeKey(key: string): ConfigPath | null {
    if (key in CONFIG_VALUE_KINDS) return key as ConfigPath;
    return LEGACY_CONFIG_ALIASES[key] ?? null;
  }

  static normalizeEntry(rawKey: string, rawValue: string): { key: ConfigPath; value: string } | null {
    const key = this.normalizeKey(rawKey);
    if (!key) return null;
    const value = rawKey === "scan_interval_seconds"
      ? String(Number(rawValue) * 1000)
      : rawValue;
    return { key, value };
  }

  static defaults(): RuntimeConfig {
    return cloneDefaultConfig();
  }

  static defaultFlat(includeLegacyAliases = true): Record<string, string> {
    const flat: Record<string, string> = {};
    const defaults = this.defaults();
    for (const key of this.canonicalKeys()) {
      flat[key] = String(getPath(defaults, key));
    }
    if (includeLegacyAliases) {
      for (const [legacy, canonical] of Object.entries(LEGACY_CONFIG_ALIASES)) {
        const value = getPath(defaults, canonical);
        flat[legacy] = canonical === "scanner.scanIntervalMs"
          ? String(Number(value) / 1000)
          : String(value);
      }
      flat.scanner_enabled = "true";
      flat.emergency_stop = String(defaults.risk.killSwitch);
    }
    return flat;
  }

  static parseRawValues(rawValues: Record<string, string | undefined>): RuntimeConfig {
    return this.validate(parseRawValuesWithoutValidation(rawValues));
  }

  static invalidRawValues(
    rawValues: Record<string, string | undefined>,
    displayKeyFor: (rawKey: string, normalizedKey: ConfigPath) => string = (rawKey) => rawKey,
  ): RawValueValidationIssue[] {
    const issues: RawValueValidationIssue[] = [];

    for (const [rawKey, rawValue] of Object.entries(rawValues)) {
      if (rawValue == null || rawValue.trim() === "") continue;

      const normalized = this.normalizeEntry(rawKey, rawValue);
      if (!normalized) continue;

      const kind = CONFIG_VALUE_KINDS[normalized.key];
      if (isValidRawValue(normalized.value, kind)) continue;

      const displayKey = displayKeyFor(rawKey, normalized.key);
      issues.push({
        rawKey,
        message: `Invalid ${displayKey}: expected ${expectedValueDescription(kind)}.`,
      });
    }

    return issues;
  }

  static validateScannerTradeLimitsForSave(rawValues: Record<string, string | undefined>): void {
    const config = parseRawValuesWithoutValidation(rawValues);
    if (config.scanner.maxDailyTrades > config.scanner.maxWeeklyTrades) {
      throw new Error(
        `scanner.maxDailyTrades=${config.scanner.maxDailyTrades} cannot exceed scanner.maxWeeklyTrades=${config.scanner.maxWeeklyTrades}`,
      );
    }
  }

  static flatten(config: RuntimeConfig, includeLegacyAliases = false): FlatRuntimeConfig {
    const flat: FlatRuntimeConfig = {};
    for (const key of this.canonicalKeys()) {
      flat[key] = getPath(config, key);
    }
    if (includeLegacyAliases) {
      for (const [legacy, canonical] of Object.entries(LEGACY_CONFIG_ALIASES)) {
        const value = getPath(config, canonical);
        flat[legacy] = canonical === "scanner.scanIntervalMs"
          ? Number(value) / 1000
          : value;
      }
      flat.scanner_enabled = true;
      flat.emergency_stop = config.risk.killSwitch;
    }
    return flat;
  }

  static validate(config: RuntimeConfig): RuntimeConfig {
    const numericKeys = this.canonicalKeys().filter((key) => CONFIG_VALUE_KINDS[key] === "number");
    for (const key of numericKeys) {
      const value = getPath(config, key);
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Invalid runtime configuration value for ${key}`);
      }
    }

    if (config.scanner.minScoreWatchlist > config.scanner.minScoreTrade) {
      throw new Error("scanner.minScoreWatchlist cannot exceed scanner.minScoreTrade");
    }
    if (config.scanner.maxDailyTrades > config.scanner.maxWeeklyTrades) {
      throw new Error("scanner.maxDailyTrades cannot exceed scanner.maxWeeklyTrades");
    }
    if (config.signal.emaFastPeriod >= config.signal.emaSlowPeriod) {
      throw new Error("signal.emaFastPeriod must be below signal.emaSlowPeriod");
    }
    if (config.signal.emaSlowPeriod > config.signal.emaTrendPeriod) {
      throw new Error("signal.emaSlowPeriod cannot exceed signal.emaTrendPeriod");
    }
    if (config.ai.temperature < 0 || config.ai.temperature > 2) {
      throw new Error("ai.temperature must be between 0 and 2");
    }
    if (config.ai.maxTokens <= 0 || config.ai.timeoutMs <= 0 || config.ai.rateLimitPerMinute <= 0) {
      throw new Error("AI runtime configuration values must be positive");
    }
    if (config.ai.retryCount < 0 || config.ai.retryDelayMs < 0 || config.ai.cacheTtlMs < 0) {
      throw new Error("AI retry and cache configuration cannot be negative");
    }

    return config;
  }
}
