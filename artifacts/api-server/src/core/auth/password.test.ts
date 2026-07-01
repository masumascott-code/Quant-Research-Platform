import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password";
import { normalizeEmail, normalizeUsername } from "./normalization";

test("hashPassword verifies the correct password", async () => {
  const storedHash = await hashPassword("correct horse battery staple");

  assert.equal(await verifyPassword("correct horse battery staple", storedHash), true);
});

test("verifyPassword rejects the wrong password", async () => {
  const storedHash = await hashPassword("correct horse battery staple");

  assert.equal(await verifyPassword("wrong horse battery staple", storedHash), false);
});

test("verifyPassword rejects malformed stored hashes safely", async () => {
  assert.equal(await verifyPassword("password", ""), false);
  assert.equal(await verifyPassword("password", "not-a-valid-hash"), false);
  assert.equal(await verifyPassword("password", "scrypt-v1$n=1$r=1$p=1$len=64$salt$hash"), false);
});

test("auth normalization trims and lowercases identifiers", () => {
  assert.equal(normalizeEmail("  User.Name+Test@Example.COM  "), "user.name+test@example.com");
  assert.equal(normalizeUsername("  Admin_User  "), "admin_user");
});
