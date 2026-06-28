import assert from "node:assert/strict";
import test from "node:test";
import { GeminiProvider } from "./GeminiProvider";
import { AIProviderError } from "./types";

test("GeminiProvider refuses calls when AI is disabled", async () => {
  const provider = new GeminiProvider("test-key");
  await assert.rejects(
    () => provider.generate({
      template: "MARKET_SUMMARY",
      messages: [{ role: "user", content: "test" }],
    }, {
      enabled: false,
      modelName: "gemini-2.5-flash",
      temperature: 0.2,
      maxTokens: 100,
      timeoutMs: 1000,
      retryCount: 0,
      retryDelayMs: 0,
      cacheTtlMs: 0,
      rateLimitPerMinute: 10,
    }),
    (error) => error instanceof AIProviderError && !error.retryable,
  );
});
