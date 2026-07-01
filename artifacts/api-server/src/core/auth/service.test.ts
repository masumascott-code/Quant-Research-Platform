import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser } from "@workspace/db";
import {
  authenticateDbUserOrFallback,
  registerPublicUser,
  validateRegistrationBody,
} from "./service";

const baseUser: AppUser = {
  id: 1,
  email: "user@example.com",
  normalizedEmail: "user@example.com",
  username: "user",
  normalizedUsername: "user",
  passwordHash: "stored",
  role: "viewer",
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  approvedAt: new Date("2026-01-01T00:00:00Z"),
  approvedBy: "admin",
  lastLoginAt: null,
};

test("validateRegistrationBody rejects short passwords", () => {
  const result = validateRegistrationBody({
    email: "new@example.com",
    username: "new_user",
    password: "too-short",
  });

  assert.equal(result.ok, false);
});

test("validateRegistrationBody accepts safe registration input without role or status", () => {
  const result = validateRegistrationBody({
    email: " New@Example.COM ",
    username: "New_User",
    password: "correct horse battery staple",
    role: "admin",
    status: "active",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(Object.keys(result.input).sort(), ["email", "password", "username"]);
    assert.equal(result.input.email, "New@Example.COM");
    assert.equal(result.input.username, "New_User");
  }
});

test("registerPublicUser creates viewer user and returns pending status", async () => {
  const result = await registerPublicUser({
    email: "new@example.com",
    username: "new_user",
    password: "correct horse battery staple",
  }, {
    findUserByIdentifier: async () => null,
    createUser: async (input) => ({
      ...baseUser,
      id: 2,
      email: input.email,
      username: input.username,
      normalizedEmail: input.email.toLowerCase(),
      normalizedUsername: input.username.toLowerCase(),
      status: "pending",
      approvedAt: null,
      approvedBy: null,
    }),
    autoApprove: false,
  });

  assert.deepEqual(result, { status: "pending", duplicate: false });
});

test("registerPublicUser handles duplicate identifiers safely", async () => {
  const result = await registerPublicUser({
    email: "user@example.com",
    username: "user",
    password: "correct horse battery staple",
  }, {
    findUserByIdentifier: async () => baseUser,
    createUser: async () => {
      throw new Error("should not create duplicate user");
    },
    autoApprove: false,
  });

  assert.deepEqual(result, { status: "pending", duplicate: true });
});

test("authenticateDbUserOrFallback logs in active DB user and updates last login", async () => {
  let updatedUserId: number | null = null;
  const result = await authenticateDbUserOrFallback("user@example.com", "correct password", {
    findUserByIdentifier: async () => baseUser,
    verifyPassword: async () => true,
    updateLastLoginAt: async (userId) => {
      updatedUserId = userId;
    },
    authenticateFallback: () => {
      throw new Error("fallback should not be used for matching DB user");
    },
  });

  assert.deepEqual(result, { username: "user", role: "viewer", userId: 1 });
  assert.equal(updatedUserId, 1);
});

test("authenticateDbUserOrFallback rejects pending and disabled DB users", async () => {
  for (const status of ["pending", "disabled"] as const) {
    const result = await authenticateDbUserOrFallback("user@example.com", "correct password", {
      findUserByIdentifier: async () => ({ ...baseUser, status }),
      verifyPassword: async () => true,
      updateLastLoginAt: async () => {
        throw new Error("inactive user should not update last login");
      },
      authenticateFallback: () => {
        throw new Error("fallback should not be used for matching DB user");
      },
    });

    assert.equal(result, null);
  }
});

test("authenticateDbUserOrFallback does not fallback when DB password is wrong", async () => {
  const result = await authenticateDbUserOrFallback("user@example.com", "wrong password", {
    findUserByIdentifier: async () => baseUser,
    verifyPassword: async () => false,
    updateLastLoginAt: async () => {
      throw new Error("wrong password should not update last login");
    },
    authenticateFallback: () => ({ username: "user@example.com", role: "admin" }),
  });

  assert.equal(result, null);
});

test("authenticateDbUserOrFallback uses env fallback only when DB user is absent", async () => {
  const result = await authenticateDbUserOrFallback("admin", "env password", {
    findUserByIdentifier: async () => null,
    verifyPassword: async () => false,
    updateLastLoginAt: async () => {
      throw new Error("env fallback should not update DB user");
    },
    authenticateFallback: () => ({ username: "admin", role: "admin" }),
  });

  assert.deepEqual(result, { username: "admin", role: "admin" });
});
