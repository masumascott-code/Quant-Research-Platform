const baseUrl = process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:8080";
const durationMs = Number(process.env.LOAD_TEST_DURATION_MS ?? 30_000);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 10);
const path = process.env.LOAD_TEST_PATH ?? "/api/healthz";

let requests = 0;
let failures = 0;
let totalLatency = 0;
const deadline = Date.now() + durationMs;

async function worker() {
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) failures += 1;
    } catch {
      failures += 1;
    } finally {
      totalLatency += performance.now() - started;
      requests += 1;
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

console.log(
  JSON.stringify(
    {
      baseUrl,
      path,
      durationMs,
      concurrency,
      requests,
      failures,
      avgLatencyMs:
        requests > 0 ? Number((totalLatency / requests).toFixed(2)) : 0,
      requestsPerSecond: Number((requests / (durationMs / 1000)).toFixed(2)),
    },
    null,
    2,
  ),
);

export {};
