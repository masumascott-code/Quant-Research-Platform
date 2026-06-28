import type { RuntimeConfig } from "./types";

export class ConfigurationCache {
  private value: RuntimeConfig | null = null;
  private loadedAt: number | null = null;

  constructor(private readonly ttlMs: number) {}

  get(): RuntimeConfig | null {
    if (!this.value || !this.loadedAt) return null;
    if (Date.now() - this.loadedAt > this.ttlMs) return null;
    return this.value;
  }

  getStale(): RuntimeConfig | null {
    return this.value;
  }

  set(value: RuntimeConfig): void {
    this.value = value;
    this.loadedAt = Date.now();
  }

  invalidate(): void {
    this.value = null;
    this.loadedAt = null;
  }
}
