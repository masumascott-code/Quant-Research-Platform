import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationValidator } from "../core/config/ConfigurationValidator";
import { isDuplicateSmcSignal } from "./smc-scanner";

test("SMC scanner defaults are enabled for paper-trading test mode", () => {
  const config = ConfigurationValidator.defaults();

  assert.equal(config.smcScanner.enabled, true);
  assert.equal(config.smcScanner.shadowMode, false);
  assert.equal(config.smcScanner.paperTradingEnabled, true);
  assert.equal(config.smcScanner.minSmcScoreTrade, 80);
  assert.equal(config.smcScanner.minSmcScoreWatchlist, 65);
  assert.equal(config.smcScanner.minRiskReward, 2);
  assert.equal(config.smcScanner.maxOpenTrades, 2);
  assert.equal(config.smcScanner.maxDailyTrades, 5);
  assert.equal(config.smcScanner.symbolCooldownMinutes, 60);
});

test("isDuplicateSmcSignal only blocks same active SMC symbol and direction", () => {
  const existing = [
    { symbol: "ETHUSDT", direction: "LONG", scannerType: "TECHNICAL_SCANNER", status: "active" },
    { symbol: "ETHUSDT", direction: "SHORT", scannerType: "SMC_SCANNER", status: "active" },
    { symbol: "SOLUSDT", direction: "LONG", scannerType: "SMC_SCANNER", status: "expired" },
  ];

  assert.equal(isDuplicateSmcSignal(existing, "ETHUSDT", "LONG"), false);
  assert.equal(isDuplicateSmcSignal(existing, "ETHUSDT", "SHORT"), true);
  assert.equal(isDuplicateSmcSignal(existing, "SOLUSDT", "LONG"), false);
});
