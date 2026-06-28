import { db, systemSettingsTable } from "@workspace/db";
import { logger } from "../../lib/logger";

export class ConfigurationRepository {
  async getAll(): Promise<Record<string, string>> {
    try {
      const rows = await db.select().from(systemSettingsTable);
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    } catch (err) {
      logger.error({ err }, "Failed to load runtime configuration from database");
      return {};
    }
  }
}
