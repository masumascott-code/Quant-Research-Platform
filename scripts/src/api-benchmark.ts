const baseUrl = process.env.BENCHMARK_BASE_URL ?? "http://127.0.0.1:8080";
const paths = (
  process.env.BENCHMARK_PATHS ?? "/api/healthz,/api/readyz,/api/metrics"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

for (const path of paths) {
  const samples: number[] = [];
  for (let i = 0; i < 25; i += 1) {
    const started = performance.now();
    const response = await fetch(`${baseUrl}${path}`);
    await response.arrayBuffer();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      path,
      p50Ms: Number(samples[Math.floor(samples.length * 0.5)].toFixed(2)),
      p95Ms: Number(samples[Math.floor(samples.length * 0.95)].toFixed(2)),
    }),
  );
}

export {};
