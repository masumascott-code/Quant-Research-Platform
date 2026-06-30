import { Router } from "express";
import { PriceTracker } from "../services/price-tracker";
import { configService } from "../core/config";
import { logger } from "../lib/logger";

const router = Router();
const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h"]);

/** GET /api/live/prices — Snapshot of latest mark prices (poll-friendly) */
router.get("/prices", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(PriceTracker.getInstance().getLatestPrices());
});

router.get("/candles", async (req, res) => {
  const symbol = String(req.query.symbol ?? "").trim().toUpperCase();
  const interval = String(req.query.interval ?? "15m");
  const limit = Math.min(Math.max(Number(req.query.limit) || 80, 20), 200);

  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) {
    res.status(400).json({ error: "Invalid symbol" });
    return;
  }

  if (!ALLOWED_INTERVALS.has(interval)) {
    res.status(400).json({ error: "Invalid interval" });
    return;
  }

  try {
    const config = configService.getSync().priceTracker;
    const url = `${config.binanceBaseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(config.fetchTimeoutMs) });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "Failed to fetch candles" });
      return;
    }

    const raw = await upstream.json() as any[][];
    res.setHeader("Cache-Control", "no-store");
    res.json({
      symbol,
      interval,
      candles: raw.map((candle) => ({
        timestamp: Number(candle[0]),
        open: Number(candle[1]),
        high: Number(candle[2]),
        low: Number(candle[3]),
        close: Number(candle[4]),
        volume: Number(candle[5]),
      })),
    });
  } catch (err) {
    logger.warn({ err, symbol, interval }, "Failed to fetch live candles");
    res.status(502).json({ error: "Failed to fetch candles" });
  }
});

export default router;
