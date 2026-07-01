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
