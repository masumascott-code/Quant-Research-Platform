const fs = require("node:fs");

const wrongLockfiles = ["package-lock.json", "yarn.lock"].filter((file) =>
  fs.existsSync(file),
);

if (wrongLockfiles.length > 0) {
  console.error("This workspace requires pnpm.");
  console.error(
    `Remove the unsupported lockfile(s) manually: ${wrongLockfiles.join(", ")}`,
  );
  process.exit(1);
}

const userAgent = process.env.npm_config_user_agent || "";

if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
