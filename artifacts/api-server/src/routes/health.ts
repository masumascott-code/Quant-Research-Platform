import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { metricsContentType, renderMetrics } from "../infra/metrics";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  } catch (err) {
    res.status(503).json({ status: "not_ready" });
  }
});

router.get("/livez", (_req, res) => {
  res.json({ status: "alive" });
});

router.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", metricsContentType());
  res.send(await renderMetrics());
});

export default router;
