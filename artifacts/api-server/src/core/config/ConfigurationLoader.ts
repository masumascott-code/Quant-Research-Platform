import { ConfigurationRepository } from "./ConfigurationRepository";
import { ConfigurationValidator } from "./ConfigurationValidator";
import type { RuntimeConfig } from "./types";

export class ConfigurationLoader {
  constructor(private readonly repository: ConfigurationRepository) {}

  async load(): Promise<RuntimeConfig> {
    const envValues: Record<string, string | undefined> = {};
    for (const key of ConfigurationValidator.canonicalKeys()) {
      const envKey = ConfigurationValidator.envKeyFor(key);
      envValues[key] = process.env[envKey];
    }

    const databaseValues = await this.repository.getAll();

    return ConfigurationValidator.parseRawValues({
      ...envValues,
      ...databaseValues,
    });
  }
}
