import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable, paperTradesTable, signalsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { configService, ConfigurationValidator } from "../core/config";
import { riskManager } from "../services/risk-manager";
import { ScannerService } from "../services/scanner";
import {
  approveAppUser,
  disableAppUser,
  isAuthUserSchemaUnavailable,
  listAppUsers,
} from "../core/auth/users";
import {
  canDisableUser,
  parseAppUserLimit,
  parseAppUserStatusFilter,
  sanitizeAppUser,
} from "../core/auth/admin-users";

const router = Router();

class SettingsValidationError extends Error {}

type SettingsRow = {
  key: string;
  value: string;
  updatedAt: Date;
};

function buildValuesToPersist(settings: Record<string, string>): Map<string, string> {
  const valuesToPersist = new Map<string, string>();
  const canonicalValues = new Map<string, string>();

  const entries = Object.entries(settings);
  for (const [key, value] of entries) {
    valuesToPersist.set(key, value);
    const normalized = ConfigurationValidator.normalizeEntry(key, value);
    if (normalized && normalized.key === key) {
      canonicalValues.set(normalized.key, normalized.value);
    }
  }

  for (const [key, value] of entries) {
    const normalized = ConfigurationValidator.normalizeEntry(key, value);
    if (normalized && normalized.key !== key) {
      canonicalValues.set(normalized.key, normalized.value);
    }
  }

  for (const [key, value] of canonicalValues) {
    valuesToPersist.set(key, value);
  }

  return valuesToPersist;
}

function applySettingValue(candidate: Record<string, string>, key: string, value: string): void {
  candidate[key] = value;
  const normalized = ConfigurationValidator.normalizeEntry(key, value);
  if (normalized) {
    candidate[normalized.key] = normalized.value;
  }
}

function buildCandidateSettings(rows: SettingsRow[], valuesToPersist: Map<string, string>): Record<string, string> {
  const candidate: Record<string, string> = {};

  for (const row of rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())) {
    applySettingValue(candidate, row.key, row.value);
  }

  for (const [key, value] of valuesToPersist) {
    applySettingValue(candidate, key, value);
  }

  return candidate;
}

function requireAdmin(req: Request, res: Response): boolean {
  if (req.auth?.role === "admin") return true;
  res.status(403).json({ error: "Admin role required" });
  return false;
}

function parseUserId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleAppUserError(err: unknown, res: Response): boolean {
  if (isAuthUserSchemaUnavailable(err)) {
    res.status(503).json({ error: "User management is temporarily unavailable" });
    return true;
  }

  return false;
}

router.get("/users", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const status = parseAppUserStatusFilter(req.query.status);
  if (!status) {
    res.status(400).json({ error: "Invalid user status filter" });
    return;
  }

  const limit = parseAppUserLimit(req.query.limit);

  try {
    const users = await listAppUsers({ status, limit });
    res.json({ users: users.map(sanitizeAppUser) });
  } catch (err) {
    if (handleAppUserError(err, res)) return;
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users/:id/approve", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const id = parseUserId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  try {
    const user = await approveAppUser(id, req.auth?.username ?? "admin");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: sanitizeAppUser(user) });
  } catch (err) {
    if (handleAppUserError(err, res)) return;
    res.status(500).json({ error: "Failed to approve user" });
  }
});

router.post("/users/:id/disable", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const id = parseUserId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  if (!canDisableUser(id, req.auth)) {
    res.status(400).json({ error: "Cannot disable the current authenticated user" });
    return;
  }

  try {
    const user = await disableAppUser(id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: sanitizeAppUser(user) });
  } catch (err) {
    if (handleAppUserError(err, res)) return;
    res.status(500).json({ error: "Failed to disable user" });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const settings: Record<string, string> = { ...configService.defaultsFlat(true) };
    for (const row of rows) {
      settings[row.key] = row.value;
      const normalized = ConfigurationValidator.normalizeEntry(row.key, row.value);
      if (normalized) {
        settings[normalized.key] = normalized.value;
      }
    }
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.post("/settings", async (req, res) => {
  try {
    const { settings } = req.body as { settings: Record<string, string> };
    const valuesToPersist = buildValuesToPersist(settings);
    const existingRows = await db.select().from(systemSettingsTable);
    const candidateSettings = buildCandidateSettings(existingRows, valuesToPersist);

    try {
      ConfigurationValidator.validateScannerTradeLimitsForSave(candidateSettings);
    } catch (err) {
      throw new SettingsValidationError((err as Error).message);
    }

    for (const [key, value] of valuesToPersist) {
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
    if (err instanceof SettingsValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
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
