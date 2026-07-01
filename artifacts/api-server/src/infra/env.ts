import { logger } from "../lib/logger";
import { ConfigurationValidator } from "../core/config/ConfigurationValidator";

const productionRequired = [
  "DATABASE_URL",
  "JWT_SECRET",
  "ADMIN_PASSWORD",
  "VIEWER_PASSWORD",
  "CORS_ORIGINS",
] as const;

const optionalProductionWarnings = [
  "REDIS_URL",
  "GEMINI_API_KEY",
  "LOG_LEVEL",
] as const;

export function validateProductionEnvironment(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing = productionRequired.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`,
    );
  }

  if ((process.env.JWT_SECRET ?? "").length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production.");
  }

  if (process.env.AUTH_ENABLED === "false") {
    throw new Error("AUTH_ENABLED=false is not allowed in production.");
  }

  validateRuntimeConfigEnvironment();

  for (const name of optionalProductionWarnings) {
    if (!process.env[name]?.trim()) {
      logger.warn(
        { env: name },
        "Optional production environment variable is not set",
      );
    }
  }
}

function validateRuntimeConfigEnvironment(): void {
  const envValues: Record<string, string | undefined> = {};
  for (const key of ConfigurationValidator.canonicalKeys()) {
    envValues[key] = process.env[ConfigurationValidator.envKeyFor(key)];
  }

  const invalidValues = ConfigurationValidator.invalidRawValues(
    envValues,
    (_rawKey, normalizedKey) => ConfigurationValidator.envKeyFor(normalizedKey),
  );
  if (invalidValues.length === 0) return;

  const errors = invalidValues.map((issue) => issue.message);
  throw new Error(
    `Invalid runtime configuration environment variables: ${errors.join("; ")}`,
  );
}

export function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function positiveIntegerEnv(
  name: string,
  fallback: number,
  expected = "positive integer",
): number {
  return integerEnv(name, fallback, 1, expected);
}

export function nonNegativeIntegerEnv(
  name: string,
  fallback: number,
  expected = "non-negative integer",
): number {
  return integerEnv(name, fallback, 0, expected);
}

function integerEnv(
  name: string,
  fallback: number,
  min: number,
  expected: string,
): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (Number.isInteger(value) && value >= min) return value;

  throw new Error(`Invalid ${name}: expected ${expected}.`);
}
