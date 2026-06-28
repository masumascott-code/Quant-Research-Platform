# QUANTEDGE AI Performance Report Template

## Environment

- API version:
- Database size:
- Redis version:
- API replicas:
- Worker replicas:
- Test date:

## Load Test

Command:

```powershell
pnpm --filter @workspace/scripts run load-test
```

Record:

- Requests/sec:
- Avg latency:
- Failure rate:

## Stress Test

Command:

```powershell
pnpm --filter @workspace/scripts run stress-test
```

Record:

- Peak concurrency:
- Error rate:
- Saturation point:

## Memory Leak Test

Command:

```powershell
pnpm --filter @workspace/scripts run memory-leak-test
```

Record:

- RSS delta:
- Heap delta:
- Notes:

## API Benchmark

Command:

```powershell
pnpm --filter @workspace/scripts run api-benchmark
```

Record:

- p50:
- p95:
- slowest endpoint:

## Scanner Benchmark

Command:

```powershell
pnpm --filter @workspace/scripts run scanner-benchmark
```

Record:

- status latency:
- response size:

## Recommendations

- Scale API replicas when request p95 exceeds SLO.
- Scale workers when queue depth grows for more than 5 minutes.
- Tune Postgres indexes only from observed slow queries.
- Keep trading/scanner/AI logic changes out of infrastructure releases.
