import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { securityConfig, type Role } from "../config/security";
import { createJwt, verifyJwt, type JwtPayload } from "../lib/jwt";
import { logger } from "../lib/logger";

export interface AuthContext {
  username: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

export function authenticateCredentials(
  username: string,
  password: string,
): AuthContext | null {
  const user = securityConfig.users.find((candidate) =>
    safeEqual(candidate.username, username),
  );

  if (!user || !safeEqual(user.password, password)) {
    return null;
  }

  return { username: user.username, role: user.role };
}

export function issueToken(user: AuthContext): { token: string; expiresIn: number } {
  return {
    token: createJwt(user.username, user.role),
    expiresIn: securityConfig.jwtExpiresInSeconds,
  };
}

function authFromPayload(payload: JwtPayload): AuthContext {
  return {
    username: payload.sub,
    role: payload.role,
  };
}

export function rateLimit(maxRequests: number, windowMs = securityConfig.rateLimitWindowMs) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${getClientIp(req)}:${req.method}:${req.path}`;
    const current = rateLimitBuckets.get(key);
    const bucket = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);

    const remaining = Math.max(0, maxRequests - bucket.count);
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > maxRequests) {
      logger.warn({
        audit: true,
        event: "rate_limit_exceeded",
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
      });
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  if (!securityConfig.authEnabled) {
    req.auth = { username: "auth-disabled", role: "admin" };
    next();
    return;
  }

  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;

  if (!token) {
    logger.warn({
      audit: true,
      event: "auth_missing_token",
      ip: getClientIp(req),
      method: req.method,
      path: req.path,
    });
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    logger.warn({
      audit: true,
      event: "auth_invalid_token",
      ip: getClientIp(req),
      method: req.method,
      path: req.path,
    });
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.auth = authFromPayload(payload);
  next();
}

export function requireAdminForMutations(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  if (req.auth?.role !== "admin") {
    logger.warn({
      audit: true,
      event: "rbac_denied",
      username: req.auth?.username ?? "anonymous",
      role: req.auth?.role ?? "none",
      method: req.method,
      path: req.path,
      ip: getClientIp(req),
    });
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  next();
}

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    logger.info({
      audit: true,
      event: "api_request",
      username: req.auth?.username ?? "anonymous",
      role: req.auth?.role ?? "none",
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: getClientIp(req),
    });
  });

  next();
}

export function auditAuthAttempt(
  req: Request,
  username: string,
  success: boolean,
  role?: Role,
) {
  logger.info({
    audit: true,
    event: success ? "auth_login_success" : "auth_login_failure",
    username,
    role: role ?? "none",
    ip: getClientIp(req),
  });
}
