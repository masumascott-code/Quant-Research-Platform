import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoots = [
  path.join(repoRoot, "artifacts", "api-server", "src"),
  path.join(repoRoot, "artifacts", "trading-platform", "src"),
];

const tests = trackedTests();

if (tests.length === 0) {
  console.log("No .test.ts files found.");
  process.exit(0);
}

console.log(`Running ${tests.length} TypeScript test files with node:test via tsx.`);

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const testEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://test:test@127.0.0.1:5432/test",
};

for (const batch of chunk(tests, 8)) {
  const result = spawnSync(
    pnpmBin,
    ["--filter", "@workspace/scripts", "exec", "tsx", "--test", ...batch],
    {
      cwd: repoRoot,
      env: testEnv,
      shell: process.platform === "win32",
      stdio: "inherit",
    },
  );

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.exit(0);

function findTests(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return findTests(fullPath);
    return entry.endsWith(".test.ts") ? [fullPath] : [];
  });
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function trackedTests() {
  const result = spawnSync("git", ["ls-files", "*.test.ts"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return testRoots.flatMap((root) => findTests(root)).sort();
  }

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => file.startsWith("artifacts/api-server/src/") || file.startsWith("artifacts/trading-platform/src/"))
    .map((file) => path.join(repoRoot, file))
    .sort();
}
