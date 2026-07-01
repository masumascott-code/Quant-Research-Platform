import test from "node:test";
import assert from "node:assert/strict";
import { registrationFlagsFromEnv } from "./security";

test("registration flags default to disabled", () => {
  assert.deepEqual(registrationFlagsFromEnv({}), {
    registrationEnabled: false,
    registrationAutoApprove: false,
  });
});

test("registration flags parse enabled values", () => {
  assert.deepEqual(registrationFlagsFromEnv({
    REGISTRATION_ENABLED: "true",
    REGISTRATION_AUTO_APPROVE: "1",
  }), {
    registrationEnabled: true,
    registrationAutoApprove: true,
  });
});

test("registration flags treat unknown values as false", () => {
  assert.deepEqual(registrationFlagsFromEnv({
    REGISTRATION_ENABLED: "maybe",
    REGISTRATION_AUTO_APPROVE: "no",
  }), {
    registrationEnabled: false,
    registrationAutoApprove: false,
  });
});
