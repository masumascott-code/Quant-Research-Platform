import { and, eq, or } from "drizzle-orm";
import { appUsersTable, db, type AppUser } from "@workspace/db";
import { hashPassword, verifyPassword } from "./password";
import { normalizeEmail, normalizeUsername } from "./normalization";
import { securityConfig } from "../../config/security";

export { normalizeEmail, normalizeUsername } from "./normalization";

export async function findUserByNormalizedEmailOrUsername(identifier: string): Promise<AppUser | null> {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  if (!normalizedIdentifier) return null;

  const [user] = await db
    .select()
    .from(appUsersTable)
    .where(or(
      eq(appUsersTable.normalizedEmail, normalizedIdentifier),
      eq(appUsersTable.normalizedUsername, normalizedIdentifier),
    ))
    .limit(1);

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
