const baseUrl =
  process.env.SCANNER_BENCHMARK_BASE_URL ?? "http://127.0.0.1:8080";
const token = process.env.SCANNER_BENCHMARK_TOKEN;
const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
const started = performance.now();
const response = await fetch(`${baseUrl}/api/scanner/status`, { headers });
const body = await response.text();

console.log(
  JSON.stringify(
    {
      status: response.status,
      latencyMs: Number((performance.now() - started).toFixed(2)),
      bytes: body.length,
    },
    null,
    2,
  ),
);

export {};
