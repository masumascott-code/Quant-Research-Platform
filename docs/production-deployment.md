# QUANTEDGE AI Production Deployment Guide

## Architecture Diagram

```text
Browser
  -> Nginx web container
  -> API container /api
       -> PostgreSQL
       -> Redis
       -> Prometheus /api/metrics
  -> Worker container
       -> BullMQ queues in Redis
       -> PostgreSQL
  -> Scheduler container
       -> enqueues recurring jobs

Prometheus -> API metrics
Grafana -> Prometheus dashboards
```

## Deployment Diagram

```text
docker compose
  postgres      persistent volume: postgres_data
  redis         persistent volume: redis_data
  api           health: /api/readyz
  worker        queues: reports, maintenance, scanner
  scheduler     daily/weekly/cleanup jobs
  web           Nginx static frontend + /api proxy
  prometheus    scrape /api/metrics
  grafana       dashboard provisioning
```

## Infrastructure Diagram

```text
Logs: stdout JSON -> Docker json-file rotation
Metrics: prom-client -> /api/metrics -> Prometheus -> Grafana
Queues: BullMQ -> Redis -> Worker -> retry/dead-letter
Database: Drizzle schema push -> PostgreSQL -> pg_dump backups
Secrets: local-only `.env.production` or platform secret manager
```

## First Deploy

1. Copy `.env.production.example` to local-only `.env.production`, or configure equivalent platform secrets.
2. Replace all placeholder passwords and secrets. Do not commit real production env files.
3. If real production secrets were ever committed or pushed, rotate the affected credentials and tokens outside the repo before deploying.
4. Run `docker compose --env-file .env.production build`.
5. Run `docker compose --env-file .env.production up migrate`.
6. Run `docker compose --env-file .env.production up -d`.
7. Check `http://localhost:8080/api/readyz`.
8. Open Grafana at `http://localhost:3000`.

## Compose Environment Loading

Production Compose commands must load `.env.production` intentionally:

```bash
docker compose --env-file .env.production build
docker compose --env-file .env.production up migrate
docker compose --env-file .env.production up -d
```

`env_file` supplies variables inside containers after Compose has parsed the file. It does not satisfy Compose interpolation such as `${POSTGRES_PASSWORD:?}` or `${GRAFANA_ADMIN_PASSWORD:?}`, which is resolved before containers start. Use `--env-file .env.production`, exported shell variables, or equivalent deployment-platform secret injection.

## Migration Workflow

Use the project Drizzle workflow before bringing up new app containers:

```powershell
$env:DATABASE_URL="postgresql://..."
pnpm run db:migrate:production
```

In Docker:

```bash
docker compose --env-file .env.production up migrate
```

## Backup

```powershell
$env:DATABASE_URL="postgresql://..."
pnpm run db:backup
```

Backups are written to `backups/quantedge-<timestamp>.dump`.

## Restore

```powershell
$env:DATABASE_URL="postgresql://..."
pnpm run db:restore -- backups/quantedge-YYYYMMDD-HHMMSS.dump
```

## Rollback Guide

1. Keep the previous image tag before deploying a new version.
2. If health checks fail, stop the new containers:
   `docker compose --env-file .env.production down`
3. Restore the previous image tag in Compose or your registry deploy config.
4. Start the previous version:
   `docker compose --env-file .env.production up -d`
5. Restore DB only if the rollback requires schema/data reversal.
6. Validate `/api/readyz`, `/api/healthz`, and Grafana request/error panels.

## Production Safety

The worker and scheduler only enqueue or process infrastructure/reporting jobs. The adaptive learning engine writes recommendations requiring human approval and does not modify config automatically.
