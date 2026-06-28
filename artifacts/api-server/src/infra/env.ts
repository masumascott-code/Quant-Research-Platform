import { logger } from "../lib/logger";

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

  for (const name of optionalProductionWarnings) {
    if (!process.env[name]?.trim()) {
      logger.warn(
        { env: name },
        "Optional production environment variable is not set",
      );
    }
  }
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
