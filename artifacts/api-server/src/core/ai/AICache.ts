import { createHash } from "node:crypto";
import type { AIResponse } from "./types";

interface CacheEntry {
  response: AIResponse;
  expiresAt: number;
}

export class AICache {
  private readonly entries = new Map<string, CacheEntry>();

  get(key: string): AIResponse | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return { ...entry.response, cached: true };
  }

  set(key: string, response: AIResponse, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.entries.set(key, {
      response: { ...response, cached: false },
      expiresAt: Date.now() + ttlMs,
    });
  }

  keyFor(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}
