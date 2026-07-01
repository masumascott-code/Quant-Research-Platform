import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser } from "@workspace/db";
import {
  canDisableUser,
  parseAppUserLimit,
  parseAppUserStatusFilter,
  sanitizeAppUser,
} from "./admin-users";

const baseUser: AppUser = {
  id: 7,
  email: "pending@example.com",
  normalizedEmail: "pending@example.com",
  username: "pending_user",
  normalizedUsername: "pending_user",
  passwordHash: "scrypt-v1$secret",
  role: "viewer",
  status: "pending",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  approvedAt: null,
  approvedBy: null,
  lastLoginAt: null,
};

test("sanitizeAppUser omits password hash and normalized identifiers", () => {
  const sanitized = sanitizeAppUser(baseUser);

  assert.deepEqual(Object.keys(sanitized).sort(), [
    "approvedAt",
    "approvedBy",
    "createdAt",
    "email",
    "id",
    "lastLoginAt",
    "role",
    "status",
    "updatedAt",
    "username",
  ]);
  assert.equal("passwordHash" in sanitized, false);
  assert.equal("normalizedEmail" in sanitized, false);
  assert.equal("normalizedUsername" in sanitized, false);
});

test("parseAppUserStatusFilter defaults to pending and rejects unknown status", () => {
  assert.equal(parseAppUserStatusFilter(undefined), "pending");
  assert.equal(parseAppUserStatusFilter(""), "pending");
  assert.equal(parseAppUserStatusFilter("all"), "all");
  assert.equal(parseAppUserStatusFilter("active"), "active");
  assert.equal(parseAppUserStatusFilter("unknown"), null);
});

test("parseAppUserLimit uses safe defaults and max", () => {
  assert.equal(parseAppUserLimit(undefined), 50);
  assert.equal(parseAppUserLimit("0"), 50);
  assert.equal(parseAppUserLimit("25"), 25);
  assert.equal(parseAppUserLimit("500"), 100);
});

test("canDisableUser prevents disabling the current DB-backed user", () => {
  assert.equal(canDisableUser(7, { username: "admin", role: "admin", userId: 7 }), false);
  assert.equal(canDisableUser(7, { username: "admin", role: "admin" }), true);
  assert.equal(canDisableUser(7, { username: "other", role: "admin", userId: 8 }), true);
});
