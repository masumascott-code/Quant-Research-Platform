import { logger } from "../../lib/logger";
import { ConfigurationCache } from "./ConfigurationCache";
import { ConfigurationLoader } from "./ConfigurationLoader";
import { ConfigurationRepository } from "./ConfigurationRepository";
import { ConfigurationValidator } from "./ConfigurationValidator";
import type { FlatRuntimeConfig, RuntimeConfig } from "./types";

export class ConfigService {
  private static instance: ConfigService;
  private readonly cache = new ConfigurationCache(30_000);
  private readonly loader = new ConfigurationLoader(new ConfigurationRepository());
  private reloadPromise: Promise<RuntimeConfig> | null = null;

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  getSync(): RuntimeConfig {
    return this.cache.getStale() ?? ConfigurationValidator.defaults();
  }

  async get(): Promise<RuntimeConfig> {
    const cached = this.cache.get();
    if (cached) return cached;
    return this.reload();
  }

  async reload(): Promise<RuntimeConfig> {
    if (!this.reloadPromise) {
      this.reloadPromise = this.loader.load()
        .then((config) => {
          this.cache.set(config);
          return config;
        })
        .catch((err) => {
          logger.error({ err }, "Runtime configuration reload failed; using last known configuration");
          return this.getSync();
        })
        .finally(() => {
          this.reloadPromise = null;
        });
    }
    return this.reloadPromise;
  }

  invalidate(): void {
    this.cache.invalidate();
  }

  flat(includeLegacyAliases = false): FlatRuntimeConfig {
    return ConfigurationValidator.flatten(this.getSync(), includeLegacyAliases);
  }

  defaultsFlat(includeLegacyAliases = false): Record<string, string> {
    return ConfigurationValidator.defaultFlat(includeLegacyAliases);
  }
}

export const configService = ConfigService.getInstance();
