# QUANTEDGE AI Runbook

## API Not Ready

1. Check container status: `docker compose ps`.
2. Check API logs: `docker compose logs api --tail=200`.
3. Verify database: `docker compose exec postgres pg_isready -U postgres`.
4. Verify required production env values in `.env.production`.
5. Restart API only: `docker compose restart api`.

## Worker Failing Jobs

1. Check worker logs: `docker compose logs worker --tail=200`.
2. Check Redis: `docker compose exec redis redis-cli ping`.
3. Confirm `REDIS_URL=redis://redis:6379`.
4. Inspect repeated failures and dead-letter entries.
5. Restart worker: `docker compose restart worker`.

## Scheduler Not Enqueuing

1. Confirm `SCHEDULER_ENABLED=true`.
2. Check scheduler logs.
3. Confirm Redis health.
4. Restart scheduler.

## High API Latency

1. Check Grafana Request Latency p95.
2. Compare with queue throughput.
3. Inspect PostgreSQL CPU/IO.
4. Temporarily scale workers if queue pressure is high.
5. Keep API replicas separate from worker replicas.

## Database Backup Failure

1. Confirm `pg_dump` is installed where the script runs.
2. Confirm `DATABASE_URL`.
3. Confirm write access to `backups/`.
4. Run `pg_dump` manually with the same URL.

## Security Incident

1. Rotate `JWT_SECRET`, admin password, viewer password, database password, and Grafana password.
2. Restart all containers.
3. Review JSON logs by `correlationId`.
4. Review request rates and 401/403 spikes.
5. Restore from a known-good backup if data integrity is uncertain.

## Rollback

1. Stop current stack: `docker compose down`.
2. Restore previous image tags.
3. Restore DB backup only if required.
4. Start stack: `docker compose up -d`.
5. Verify `/api/readyz` and Grafana.
