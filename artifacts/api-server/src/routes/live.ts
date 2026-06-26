import { Router } from "express";
import { PriceTracker } from "../services/price-tracker";

const router = Router();

/** GET /api/live/prices — Snapshot of latest mark prices (poll-friendly) */
router.get("/prices", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(PriceTracker.getInstance().getLatestPrices());
});

export default router;
