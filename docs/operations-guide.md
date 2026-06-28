# QUANTEDGE AI Operations Guide

## Daily Checks

- API readiness: `GET /api/readyz`
- Liveness: `GET /api/livez`
- Metrics scrape: `GET /api/metrics`
- Grafana dashboard: QUANTEDGE AI Overview
- Queue failures: inspect worker logs for `Worker job failed`
- Redis health: `redis-cli ping`
- Database health: `pg_isready`

## Logging

The API uses Pino JSON logs in production.

Every request receives:

- `X-Request-ID`
- `X-Correlation-ID`

Docker Compose uses `json-file` log rotation:

- `max-size=10m`
- `max-file=5`

## Metrics

Prometheus metrics include:

- Request rate and latency
- Scanner running state
- Scanner next scan seconds
- Trade open/closed counts
- Total closed-trade PnL
- AI advisory request status
- Queue job throughput and duration

## Alerting Recommendations

Create alerts for:

- `/api/readyz` failing for 2 minutes
- HTTP 5xx rate above 1% for 5 minutes
- p95 request latency above 2 seconds
- `quantedge_scanner_running == 0` during market hours
- Queue failed jobs increasing
- Redis unavailable
- PostgreSQL unavailable
- Worker restarts above threshold

## Scheduler Jobs

The scheduler enqueues:

- Daily AI report
- Weekly AI report
- Adaptive learning run
- Scanner cleanup
- Market snapshot cleanup
- Learning-history cleanup

Intervals are controlled by environment variables in `.env.production.example`.

## Queue Operations

BullMQ queues:

- `reports`
- `maintenance`
- `scanner`
- `dead-letter`

Failed jobs retry with exponential backoff. Jobs that exhaust attempts are copied to the dead-letter queue.

## Performance Testing

Run against a deployed API:

```powershell
$env:LOAD_TEST_BASE_URL="http://localhost:8080"
pnpm --filter @workspace/scripts run load-test
pnpm --filter @workspace/scripts run stress-test
pnpm --filter @workspace/scripts run memory-leak-test
pnpm --filter @workspace/scripts run api-benchmark
```

Scanner benchmark requires a token:

```powershell
$env:SCANNER_BENCHMARK_TOKEN="Bearer-token-value"
pnpm --filter @workspace/scripts run scanner-benchmark
```
