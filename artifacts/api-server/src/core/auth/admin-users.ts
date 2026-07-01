import type { AppUser } from "@workspace/db";
import type { AuthContext } from "../../middleware/security";

export type AppUserStatusFilter = "pending" | "active" | "disabled" | "all";

export interface AppUserAdminView {
  id: number;
  email: string;
  username: string;
  role: AppUser["role"];
  status: AppUser["status"];
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  approvedBy: string | null;
  lastLoginAt: Date | null;
}

export function sanitizeAppUser(user: AppUser): AppUserAdminView {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    approvedAt: user.approvedAt,
    approvedBy: user.approvedBy,
    lastLoginAt: user.lastLoginAt,
  };
}

export function parseAppUserStatusFilter(value: unknown): AppUserStatusFilter | null {
  if (value == null || value === "") return "pending";
  if (value === "pending" || value === "active" || value === "disabled" || value === "all") {
    return value;
  }

  return null;
}

export function parseAppUserLimit(value: unknown, fallback = 50, max = 100): number {
  const limit = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(limit) || limit <= 0) return fallback;
  return Math.min(limit, max);
}

export function canDisableUser(targetUserId: number, currentUser?: AuthContext): boolean {
  return currentUser?.userId !== targetUserId;
}
