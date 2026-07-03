import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationValidator } from "./ConfigurationValidator";

test("validateScannerTradeLimitsForSave rejects daily trades greater than weekly trades", () => {
  assert.throws(
    () => ConfigurationValidator.validateScannerTradeLimitsForSave({
      "scanner.maxDailyTrades": "20",
      "scanner.maxWeeklyTrades": "15",
    }),
    /scanner\.maxDailyTrades=20 cannot exceed scanner\.maxWeeklyTrades=15/,
  );
});

test("validateScannerTradeLimitsForSave accepts daily trades equal to weekly trades", () => {
  assert.doesNotThrow(() => ConfigurationValidator.validateScannerTradeLimitsForSave({
    "scanner.maxDailyTrades": "15",
    "scanner.maxWeeklyTrades": "15",
  }));
});

test("validateScannerTradeLimitsForSave accepts daily trades below weekly trades", () => {
  assert.doesNotThrow(() => ConfigurationValidator.validateScannerTradeLimitsForSave({
    "scanner.maxDailyTrades": "10",
    "scanner.maxWeeklyTrades": "15",
  }));
});

test("validateScannerTradeLimitsForSave treats max_daily_trades as scanner.maxDailyTrades", () => {
  assert.throws(
    () => ConfigurationValidator.validateScannerTradeLimitsForSave({
      max_daily_trades: "20",
      "scanner.maxWeeklyTrades": "15",
    }),
    /scanner\.maxDailyTrades=20 cannot exceed scanner\.maxWeeklyTrades=15/,
  );
});

test("validateScannerTradeLimitsForSave validates partial candidate updates against existing settings", () => {
  const existingWithPartialUpdate = {
    "scanner.maxWeeklyTrades": "15",
    "scanner.maxDailyTrades": "20",
  };

  assert.throws(
    () => ConfigurationValidator.validateScannerTradeLimitsForSave(existingWithPartialUpdate),
    /scanner\.maxDailyTrades=20 cannot exceed scanner\.maxWeeklyTrades=15/,
  );
});

test("invalidRawValues reports invalid QE numeric values without exposing raw values", () => {
  const issues = ConfigurationValidator.invalidRawValues(
    { "scanner.maxDailyTrades": "not-a-number" },
    (_rawKey, normalizedKey) => ConfigurationValidator.envKeyFor(normalizedKey),
  );

  assert.deepEqual(issues, [
    {
      rawKey: "scanner.maxDailyTrades",
      message: "Invalid QE_SCANNER_MAX_DAILY_TRADES: expected finite number.",
    },
  ]);
});

test("invalidRawValues accepts valid QE numeric values", () => {
  const issues = ConfigurationValidator.invalidRawValues(
    { "scanner.maxDailyTrades": "15" },
    (_rawKey, normalizedKey) => ConfigurationValidator.envKeyFor(normalizedKey),
  );

  assert.deepEqual(issues, []);
});

test("risk auto loss limits default to disabled", () => {
  assert.equal(ConfigurationValidator.defaults().risk.autoLossLimitsEnabled, false);
});

test("risk auto loss limits can be enabled by canonical key", () => {
  const config = ConfigurationValidator.parseRawValues({
    "risk.autoLossLimitsEnabled": "true",
  });

  assert.equal(config.risk.autoLossLimitsEnabled, true);
});

test("risk auto loss limits can be enabled by legacy-style alias", () => {
  const config = ConfigurationValidator.parseRawValues({
    auto_loss_limits_enabled: "true",
  });

  assert.equal(config.risk.autoLossLimitsEnabled, true);
});
