import { createHmac, timingSafeEqual } from "node:crypto";
import { securityConfig, type Role } from "../config/security";

export interface JwtPayload {
  sub: string;
  role: Role;
  userId?: number;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function sign(input: string): string {
  return base64UrlEncode(
    createHmac("sha256", securityConfig.jwtSecret).update(input).digest(),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePayload(value: unknown): JwtPayload | null {
  if (!isRecord(value)) return null;

  const { sub, role, userId, iss, aud, iat, exp } = value;
  if (typeof sub !== "string") return null;
  if (role !== "admin" && role !== "viewer") return null;
  if (userId !== undefined && typeof userId !== "number") return null;
  if (typeof iss !== "string" || typeof aud !== "string") return null;
  if (typeof iat !== "number" || typeof exp !== "number") return null;

  return { sub, role, userId, iss, aud, iat, exp };
}

export function createJwt(subject: string, role: Role, userId?: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: subject,
    role,
    ...(userId == null ? {} : { userId }),
    iss: securityConfig.jwtIssuer,
    aud: securityConfig.jwtAudience,
    iat: now,
    exp: now + securityConfig.jwtExpiresInSeconds,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  if (!header || !body || !signature) return null;

  const expected = sign(`${header}.${body}`);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = parsePayload(JSON.parse(base64UrlDecode(body).toString("utf8")));
    const now = Math.floor(Date.now() / 1000);
    if (!payload) return null;
    if (payload.iss !== securityConfig.jwtIssuer) return null;
    if (payload.aud !== securityConfig.jwtAudience) return null;
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
