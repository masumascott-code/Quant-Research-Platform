const baseUrl = process.env.MEMORY_TEST_BASE_URL ?? "http://127.0.0.1:8080";
const iterations = Number(process.env.MEMORY_TEST_ITERATIONS ?? 1_000);
const path = process.env.MEMORY_TEST_PATH ?? "/api/healthz";
const startMemory = process.memoryUsage();

for (let i = 0; i < iterations; i += 1) {
  await fetch(`${baseUrl}${path}`);
}

const endMemory = process.memoryUsage();
console.log(
  JSON.stringify(
    {
      iterations,
      rssDeltaMb: Number(
        ((endMemory.rss - startMemory.rss) / 1024 / 1024).toFixed(2),
      ),
      heapUsedDeltaMb: Number(
        ((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024).toFixed(2),
      ),
    },
    null,
    2,
  ),
);

export {};
