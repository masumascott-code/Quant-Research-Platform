import assert from "node:assert/strict";
import test from "node:test";
import { PromptBuilder } from "./PromptBuilder";
import type { AIContext } from "./types";

test("PromptBuilder creates advisory-only prompts and redacts secrets", () => {
  const context: AIContext = {
    generatedAt: new Date(0).toISOString(),
    journal: { notes: ["GEMINI_API_KEY=secret DATABASE_URL=postgres://secret"] },
  };
  const messages = new PromptBuilder().build("TRADE_REVIEW", context, "Bearer abc.def.ghi");
  const prompt = messages.map((message) => message.content).join("\n");

  assert.match(prompt, /must never place trades/i);
  assert.doesNotMatch(prompt, /secret/);
  assert.match(prompt, /REDACTED/);
});
