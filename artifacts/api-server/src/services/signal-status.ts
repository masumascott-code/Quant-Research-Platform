import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db";
import { and, eq, inArray, lt } from "drizzle-orm";
import { configService } from "../core/config";
import { logger } from "../lib/logger";

const OPEN_SIGNAL_STATUSES = ["pending", "active"] as const;
const RECONCILE_MIN_INTERVAL_MS = 15_000;

export interface SignalStopCheck {
  direction: string;
  stopLoss: number;
}

export interface MarkPrice {
  symbol: string;
  price: number;
}

interface BinanceMarkPrice {
  symbol: string;
  markPrice: string;
  time?: number;
}

let lastReconciledAt = 0;
let inFlight: Promise<void> | null = null;

export function isStopLossBreached(
  signal: SignalStopCheck,
  currentPrice: number,
): boolean {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(signal.stopLoss))
    return false;
  return signal.direction === "SHORT"
    ? currentPrice >= signal.stopLoss
    : currentPrice <= signal.stopLoss;
}

export async function reconcileSignalStatuses(
  options: { force?: boolean } = {},
): Promise<void> {
  const nowMs = Date.now();
  if (!options.force && nowMs - lastReconciledAt < RECONCILE_MIN_INTERVAL_MS)
    return;
  if (inFlight) return inFlight;

  inFlight = reconcileNow()
    .catch((err) => {
      logger.warn({ err }, "Failed to reconcile signal statuses");
    })
    .finally(() => {
      lastReconciledAt = Date.now();
      inFlight = null;
    });

  return inFlight;
}

async function reconcileNow(): Promise<void> {
  const now = new Date();

  await db
    .update(signalsTable)
    .set({ status: "expired" })
    .where(
      and(
        inArray(signalsTable.status, [...OPEN_SIGNAL_STATUSES]),
        lt(signalsTable.expiresAt, now),
      ),
    );

  const openSignals = await db
    .select({
      id: signalsTable.id,
      symbol: signalsTable.symbol,
      direction: signalsTable.direction,
      stopLoss: signalsTable.stopLoss,
      status: signalsTable.status,
    })
    .from(signalsTable)
    .where(inArray(signalsTable.status, [...OPEN_SIGNAL_STATUSES]));

  if (openSignals.length === 0) return;

  const symbols = [
    ...new Set(openSignals.map((signal) => signal.symbol.toUpperCase())),
  ];
  const prices = await fetchMarkPrices(symbols);
  if (prices.size === 0) return;

  for (const signal of openSignals) {
    const price = prices.get(signal.symbol.toUpperCase());
    if (price == null) continue;

    if (
      isStopLossBreached(
        { direction: signal.direction, stopLoss: Number(signal.stopLoss) },
        price,
      )
    ) {
      await db
        .update(signalsTable)
        .set({ status: "expired" })
        .where(
          and(
            eq(signalsTable.id, signal.id),
            inArray(signalsTable.status, [...OPEN_SIGNAL_STATUSES]),
          ),
        );
      logger.info(
        { signalId: signal.id, symbol: signal.symbol, price },
        "Signal expired after stop loss breach",
      );
    }
  }
}

export async function fetchMarkPrices(
  symbols: string[],
): Promise<Map<string, number>> {
  const uniqueSymbols = [
    ...new Set(
      symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    ),
  ];
  const prices = new Map<string, number>();
  if (uniqueSymbols.length === 0) return prices;

  const config = configService.getSync().priceTracker;

  try {
    if (uniqueSymbols.length === 1) {
      const symbol = uniqueSymbols[0]!;
      const url = `${config.binanceBaseUrl}/fapi/v1/premiumIndex?symbol=${symbol}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(config.fetchTimeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BinanceMarkPrice;
      addPrice(prices, data);
      return prices;
    }

    const wantedSymbols = new Set(uniqueSymbols);
    const url = `${config.binanceBaseUrl}/fapi/v1/premiumIndex`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const all = (await res.json()) as BinanceMarkPrice[];
    for (const entry of all) {
      if (wantedSymbols.has(entry.symbol)) addPrice(prices, entry);
    }
  } catch (err: any) {
    if (err?.name !== "TimeoutError" && err?.name !== "AbortError") {
      logger.warn({ err: err?.message }, "Signal mark price fetch failed");
    }
  }

  return prices;
}

function addPrice(prices: Map<string, number>, entry: BinanceMarkPrice) {
  const price = Number(entry.markPrice);
  if (Number.isFinite(price)) {
    prices.set(entry.symbol.toUpperCase(), price);
  }
}
