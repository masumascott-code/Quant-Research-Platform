import test from "node:test";
import assert from "node:assert/strict";
import { registrationFlagsForRuntime, registrationFlagsFromEnv } from "./security";

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

test("registration auto approve is forced off in production runtime flags", () => {
  assert.deepEqual(registrationFlagsForRuntime({
    REGISTRATION_ENABLED: "true",
    REGISTRATION_AUTO_APPROVE: "true",
  }, true), {
    registrationEnabled: true,
    registrationAutoApprove: false,
  });
});
