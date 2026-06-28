import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable, paperTradesTable, signalsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { configService } from "../core/config";
import { riskManager } from "../services/risk-manager";
import { ScannerService } from "../services/scanner";

const router = Router();

router.get("/settings", async (req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const settings: Record<string, string> = { ...configService.defaultsFlat(true) };
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.post("/settings", async (req, res) => {
  try {
    const { settings } = req.body as { settings: Record<string, string> };
    for (const [key, value] of Object.entries(settings)) {
      await db.insert(systemSettingsTable)
        .values({ key, value })
        .onConflictDoUpdate({
          target: systemSettingsTable.key,
          set: { value, updatedAt: new Date() },
        });
    }
    configService.invalidate();
    await configService.reload();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.get("/risk-state", async (req, res) => {
  try {
    const state = await riskManager.getState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch risk state" });
  }
});

router.post("/risk/pause", async (req, res) => {
  try {
    const { reason, durationMinutes } = req.body;
    await riskManager.pause(reason ?? "Manual pause", durationMinutes ?? configService.getSync().risk.manualPauseDefaultMinutes);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to pause" });
  }
});

router.post("/risk/resume", async (req, res) => {
  try {
    await riskManager.resume();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to resume" });
  }
});

router.post("/emergency-stop", async (req, res) => {
  try {
    const scanner = ScannerService.getInstance();
    scanner.stop();
    await riskManager.pause("Emergency stop activated", configService.getSync().risk.emergencyPauseMinutes);
    res.json({ success: true, message: "Emergency stop activated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to activate emergency stop" });
  }
});

router.get("/overview", async (req, res) => {
  try {
    const riskState = await riskManager.getState();
    const scannerStatus = ScannerService.getInstance().getStatus();

    const recentSignals = await db.select().from(signalsTable)
      .orderBy(desc(signalsTable.createdAt)).limit(10);

    const recentTrades = await db.select().from(paperTradesTable)
      .orderBy(desc(paperTradesTable.openedAt)).limit(10);

    res.json({ riskState, scannerStatus, recentSignals, recentTrades });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

export default router;
