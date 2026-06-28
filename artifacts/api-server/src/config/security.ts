import { logger } from "../lib/logger";

export type Role = "admin" | "viewer";

export interface AuthUserConfig {
  username: string;
  password: string;
  role: Role;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function csvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const isProduction = process.env.NODE_ENV === "production";
const authEnabled = boolEnv("AUTH_ENABLED", true);

const jwtSecret = process.env.JWT_SECRET ??
  (isProduction ? "" : "dev-only-change-me-32-characters-minimum");

if (authEnabled && isProduction && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters when AUTH_ENABLED=true in production.");
}

if (authEnabled && !isProduction && !process.env.JWT_SECRET) {
  logger.warn("JWT_SECRET is not set. Using development-only JWT secret.");
}

const adminPassword = process.env.ADMIN_PASSWORD ?? (isProduction ? "" : "admin");
const viewerPassword = process.env.VIEWER_PASSWORD ?? (isProduction ? "" : "viewer");

if (authEnabled && isProduction && (!adminPassword || !viewerPassword)) {
  throw new Error("ADMIN_PASSWORD and VIEWER_PASSWORD must be set when AUTH_ENABLED=true in production.");
}

if (authEnabled && !isProduction && (!process.env.ADMIN_PASSWORD || !process.env.VIEWER_PASSWORD)) {
  logger.warn("Using development default API credentials. Set ADMIN_PASSWORD and VIEWER_PASSWORD for real deployments.");
}

export const securityConfig = {
  authEnabled,
  jwtSecret,
  jwtIssuer: process.env.JWT_ISSUER ?? "quantedge-ai",
  jwtAudience: process.env.JWT_AUDIENCE ?? "quantedge-api",
  jwtExpiresInSeconds: numberEnv("JWT_EXPIRES_IN_SECONDS", 60 * 60 * 8),
  corsOrigins: csvEnv("CORS_ORIGINS"),
  rateLimitWindowMs: numberEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMax: numberEnv("RATE_LIMIT_MAX", 120),
  authRateLimitMax: numberEnv("AUTH_RATE_LIMIT_MAX", 10),
  trustProxy: boolEnv("TRUST_PROXY", false),
  users: [
    {
      username: process.env.ADMIN_USERNAME ?? "admin",
      password: adminPassword,
      role: "admin",
    },
    {
      username: process.env.VIEWER_USERNAME ?? "viewer",
      password: viewerPassword,
      role: "viewer",
    },
  ] satisfies AuthUserConfig[],
};
