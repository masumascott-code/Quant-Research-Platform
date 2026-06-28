import assert from "node:assert/strict";
import test from "node:test";
import { ContextBuilder } from "./ContextBuilder";

test("ContextBuilder builds sanitized context from explicit parts", () => {
  const context = new ContextBuilder().buildFromParts({
    journal: {
      notes: ["JWT_SECRET=secret-token", "No raw dumps"],
    },
  });

  assert.ok(context.generatedAt);
  assert.equal(context.journal?.notes?.[0], "JWT_SECRET=[REDACTED]");
});
