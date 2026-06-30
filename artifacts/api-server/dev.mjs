import { spawnSync } from "node:child_process";

process.env.NODE_ENV = "development";

for (const args of [
  ["run", "build"],
  ["run", "start"],
]) {
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
