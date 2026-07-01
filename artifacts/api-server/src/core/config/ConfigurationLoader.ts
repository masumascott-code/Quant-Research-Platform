import { ConfigurationRepository } from "./ConfigurationRepository";
import { ConfigurationValidator } from "./ConfigurationValidator";
import { logger } from "../../lib/logger";
import type { RuntimeConfig } from "./types";

export class ConfigurationLoader {
  constructor(private readonly repository: ConfigurationRepository) {}

  async load(): Promise<RuntimeConfig> {
    const envValues: Record<string, string | undefined> = {};
    for (const key of ConfigurationValidator.canonicalKeys()) {
      const envKey = ConfigurationValidator.envKeyFor(key);
      envValues[key] = process.env[envKey];
    }

    const invalidEnvValues = ConfigurationValidator.invalidRawValues(
      envValues,
      (_rawKey, normalizedKey) => ConfigurationValidator.envKeyFor(normalizedKey),
    );

    if (invalidEnvValues.length > 0) {
      const errors = invalidEnvValues.map((issue) => issue.message);
      if (process.env.NODE_ENV === "production") {
        throw new Error(`Invalid runtime configuration environment variables: ${errors.join("; ")}`);
      }

      logger.warn({ errors }, "Invalid QE_* runtime configuration environment values ignored");
      for (const issue of invalidEnvValues) {
        envValues[issue.rawKey] = undefined;
      }
    }

    const databaseValues = await this.repository.getAll();

    return ConfigurationValidator.parseRawValues({
      ...envValues,
      ...databaseValues,
    });
  }
}
