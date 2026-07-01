import { and, desc, eq, or } from "drizzle-orm";
import { appUsersTable, db, type AppUser } from "@workspace/db";
import { hashPassword, verifyPassword } from "./password";
import { normalizeEmail, normalizeUsername } from "./normalization";
import { securityConfig } from "../../config/security";
import type { AppUserStatusFilter } from "./admin-users";

export { normalizeEmail, normalizeUsername } from "./normalization";

export async function findUserByNormalizedEmailOrUsername(identifier: string): Promise<AppUser | null> {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  if (!normalizedIdentifier) return null;

  let user: AppUser | undefined;
  try {
    [user] = await db
      .select()
      .from(appUsersTable)
      .where(or(
        eq(appUsersTable.normalizedEmail, normalizedIdentifier),
        eq(appUsersTable.normalizedUsername, normalizedIdentifier),
      ))
      .limit(1);
  } catch (err) {
    if (isAuthUserSchemaUnavailable(err)) {
      return null;
    }
    throw err;
  }

  return user ?? null;
}

export async function listAppUsers(params: {
  status: AppUserStatusFilter;
  limit: number;
}): Promise<AppUser[]> {
  if (params.status === "all") {
    return await db
      .select()
      .from(appUsersTable)
      .orderBy(desc(appUsersTable.createdAt))
      .limit(params.limit);
  }

  return await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.status, params.status))
    .orderBy(desc(appUsersTable.createdAt))
    .limit(params.limit);
}

export async function findAppUserById(id: number): Promise<AppUser | null> {
  const [user] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.id, id))
    .limit(1);

  return user ?? null;
}

export async function approveAppUser(id: number, approvedBy: string): Promise<AppUser | null> {
  const [user] = await db
    .update(appUsersTable)
    .set({
      status: "active",
      approvedAt: new Date(),
      approvedBy,
      updatedAt: new Date(),
    })
    .where(eq(appUsersTable.id, id))
    .returning();

  return user ?? null;
}

export async function disableAppUser(id: number): Promise<AppUser | null> {
  const [user] = await db
    .update(appUsersTable)
    .set({
      status: "disabled",
      updatedAt: new Date(),
    })
    .where(eq(appUsersTable.id, id))
    .returning();

  return user ?? null;
}

export async function createPendingViewerUser(input: {
  email: string;
  username: string;
  password: string;
}): Promise<AppUser> {
  const status = securityConfig.registrationAutoApprove ? "active" : "pending";
  const [user] = await db
    .insert(appUsersTable)
    .values({
      email: input.email.trim(),
      normalizedEmail: normalizeEmail(input.email),
      username: input.username.trim(),
      normalizedUsername: normalizeUsername(input.username),
      passwordHash: await hashPassword(input.password),
      role: "viewer",
      status,
      approvedAt: status === "active" ? new Date() : null,
      approvedBy: status === "active" ? "registration-auto-approve" : null,
    })
    .returning();

  if (!user) {
    throw new Error("Failed to create user");
  }

  return user;
}

export async function verifyDbUserPassword(user: AppUser, password: string): Promise<boolean> {
  return await verifyPassword(password, user.passwordHash);
}

export async function updateLastLoginAt(userId: number): Promise<void> {
  await db
    .update(appUsersTable)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(and(eq(appUsersTable.id, userId), eq(appUsersTable.status, "active")));
}

export function isAuthUserSchemaUnavailable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as Record<string, unknown>;
  return record.code === "42P01";
}
