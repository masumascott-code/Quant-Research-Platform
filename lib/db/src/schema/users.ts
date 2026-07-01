import { pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appUserRoleEnum = pgEnum("app_user_role", ["admin", "viewer"]);
export const appUserStatusEnum = pgEnum("app_user_status", ["pending", "active", "disabled"]);

export const appUsersTable = pgTable("app_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  username: text("username").notNull(),
  normalizedUsername: text("normalized_username").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: appUserRoleEnum("role").notNull().default("viewer"),
  status: appUserStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  lastLoginAt: timestamp("last_login_at"),
}, (table) => [
  uniqueIndex("idx_app_users_normalized_email").on(table.normalizedEmail),
  uniqueIndex("idx_app_users_normalized_username").on(table.normalizedUsername),
]);

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AppUserRole = typeof appUserRoleEnum.enumValues[number];
export type AppUserStatus = typeof appUserStatusEnum.enumValues[number];
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsersTable.$inferSelect;
