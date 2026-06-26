import { db } from "@workspace/db";
import { paperTradesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const BINANCE_BASE = "https://fapi.binance.com";
const POLL_INTERVAL_MS = 3_000;
const SYMBOL_REFRESH_MS = 30_000;

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

export class PriceTracker {
  private static instance: PriceTracker;
  private latestPrices = new Map<string, PriceUpdate>();
  private trackedSymbols = new Set<string>();
  private pollTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  static getInstance(): PriceTracker {
    if (!PriceTracker.instance) {
      PriceTracker.instance = new PriceTracker();
    }
    return PriceTracker.instance;
  }

  getLatestPrices(): Record<string, PriceUpdate> {
    return Object.fromEntries(this.latestPrices);
  }

  async start() {
    await this.refreshSymbols();
    // Immediately fetch prices after symbols are loaded
    await this.fetchPrices();
    // Start ongoing polling
    this.schedulePoll();
    // Refresh symbol list periodically (picks up new trades)
    this.refreshTimer = setInterval(() => {
      this.refreshSymbols().catch(err => logger.error({ err }, "refreshSymbols error"));
    }, SYMBOL_REFRESH_MS);
    logger.info("Price tracker started");
  }

  private schedulePoll() {
    this.pollTimer = setTimeout(async () => {
      await this.fetchPrices();
      this.schedulePoll();
    }, POLL_INTERVAL_MS);
  }

  private async refreshSymbols() {
    try {
      const openTrades = await db
        .select({ symbol: paperTradesTable.symbol })
        .from(paperTradesTable)
        .where(eq(paperTradesTable.status, "open"));

      const newSymbols = new Set(openTrades.map(t => t.symbol.toUpperCase()));
      const changed =
        newSymbols.size !== this.trackedSymbols.size ||
        [...newSymbols].some(s => !this.trackedSymbols.has(s));

      if (changed) {
        this.trackedSymbols = newSymbols;
        logger.info({ symbols: [...this.trackedSymbols] }, "Price tracker symbols updated");
        // Clear stale symbols
        for (const sym of this.latestPrices.keys()) {
          if (!this.trackedSymbols.has(sym)) this.latestPrices.delete(sym);
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to refresh tracked symbols");
    }
  }

  private async fetchPrices() {
    if (this.trackedSymbols.size === 0) return;

    const symbols = [...this.trackedSymbols];
    try {
      // Batch fetch: if single symbol use ?symbol=X, otherwise fetch all and filter
      let entries: Array<{ symbol: string; markPrice: string; time: number }>;

      if (symbols.length === 1) {
        const url = `${BINANCE_BASE}/fapi/v1/premiumIndex?symbol=${symbols[0]}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        entries = [{ symbol: data.symbol, markPrice: data.markPrice, time: data.time }];
      } else {
        // Fetch all and filter — more efficient for multiple symbols
        const url = `${BINANCE_BASE}/fapi/v1/premiumIndex`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const all: Array<{ symbol: string; markPrice: string; time: number }> = await res.json();
        entries = all.filter(d => this.trackedSymbols.has(d.symbol));
      }

      for (const entry of entries) {
        const price = parseFloat(entry.markPrice);
        if (!isNaN(price)) {
          this.latestPrices.set(entry.symbol, {
            symbol: entry.symbol,
            price,
            timestamp: entry.time ?? Date.now(),
          });
        }
      }
    } catch (err: any) {
      if (err?.name !== "TimeoutError" && err?.name !== "AbortError") {
        logger.warn({ err: err?.message }, "Price fetch failed");
      }
    }
  }
}
