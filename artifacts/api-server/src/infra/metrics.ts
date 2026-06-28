import type { NextFunction, Request, Response } from "express";
import client from "prom-client";
import { count, eq, sum } from "drizzle-orm";
import { db, paperTradesTable } from "@workspace/db";
import { ScannerService } from "../services/scanner";

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "quantedge_" });

export const httpRequestsTotal = new client.Counter({
  name: "quantedge_http_requests_total",
  help: "Total HTTP requests by method, route, and status code.",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: "quantedge_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const queueJobsTotal = new client.Counter({
  name: "quantedge_queue_jobs_total",
  help: "Queue jobs processed by queue, job name, and status.",
  labelNames: ["queue", "job", "status"],
  registers: [register],
});

export const queueJobDuration = new client.Histogram({
  name: "quantedge_queue_job_duration_seconds",
  help: "Queue job duration in seconds.",
  labelNames: ["queue", "job"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 5, 15, 60, 300],
  registers: [register],
});

export const aiRequestsTotal = new client.Counter({
  name: "quantedge_ai_requests_total",
  help: "AI advisory requests by template and status.",
  labelNames: ["template", "status"],
  registers: [register],
});

export const tradeEventsTotal = new client.Counter({
  name: "quantedge_trade_events_total",
  help: "Trade lifecycle observations by type.",
  labelNames: ["event"],
  registers: [register],
});

new client.Gauge({
  name: "quantedge_scanner_running",
  help: "Scanner service running state, 1 for running, 0 for stopped.",
  collect() {
    this.set(ScannerService.getInstance().getStatus().running ? 1 : 0);
  },
  registers: [register],
});

new client.Gauge({
  name: "quantedge_trades_open_total",
  help: "Current open paper trades.",
  async collect() {
    const rows = await db
      .select({ count: count() })
      .from(paperTradesTable)
      .where(eq(paperTradesTable.status, "open"));
    this.set(Number(rows[0]?.count ?? 0));
  },
  registers: [register],
});

new client.Gauge({
  name: "quantedge_trades_closed_total",
  help: "Total closed paper trades.",
  async collect() {
    const rows = await db
      .select({ count: count() })
      .from(paperTradesTable)
      .where(eq(paperTradesTable.status, "closed"));
    this.set(Number(rows[0]?.count ?? 0));
  },
  registers: [register],
});

new client.Gauge({
  name: "quantedge_trades_total_pnl",
  help: "Total closed paper-trade PnL.",
  async collect() {
    const rows = await db
      .select({ pnl: sum(paperTradesTable.pnl) })
      .from(paperTradesTable)
      .where(eq(paperTradesTable.status, "closed"));
    this.set(Number(rows[0]?.pnl ?? 0));
  },
  registers: [register],
});

new client.Gauge({
  name: "quantedge_scanner_next_scan_seconds",
  help: "Seconds until next scanner cycle if available.",
  collect() {
    const nextScanIn = ScannerService.getInstance().getStatus().nextScanIn ?? 0;
    this.set(Math.max(0, nextScanIn / 1000));
  },
  registers: [register],
});

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    if (req.path === "/api/metrics") return;
    const durationSeconds =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
  });

  next();
}

export async function renderMetrics(): Promise<string> {
  return await register.metrics();
}

export function metricsContentType(): string {
  return register.contentType;
}
