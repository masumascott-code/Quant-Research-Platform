import { db, systemSettingsTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { ConfigurationValidator } from "./ConfigurationValidator";

export class ConfigurationRepository {
  async getAll(): Promise<Record<string, string>> {
    try {
      const rows = await db.select().from(systemSettingsTable);
      const values: Record<string, string> = {};

      for (const row of rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())) {
        values[row.key] = row.value;
        const normalized = ConfigurationValidator.normalizeEntry(row.key, row.value);
        if (normalized) {
          values[normalized.key] = normalized.value;
        }
      }

      return values;
    } catch (err) {
      logger.error({ err }, "Failed to load runtime configuration from database");
      return {};
    }
  }
}
