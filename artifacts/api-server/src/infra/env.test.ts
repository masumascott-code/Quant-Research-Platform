import assert from "node:assert/strict";
import test from "node:test";
import {
  nonNegativeIntegerEnv,
  positiveIntegerEnv,
  validateProductionEnvironment,
} from "./env";

test("positiveIntegerEnv rejects invalid scheduler intervals", () => {
  withEnv("SCHEDULE_DAILY_REPORT_MS", "0", () => {
    assert.throws(
      () =>
        positiveIntegerEnv(
          "SCHEDULE_DAILY_REPORT_MS",
          86_400_000,
          "positive integer milliseconds",
        ),
      /Invalid SCHEDULE_DAILY_REPORT_MS: expected positive integer milliseconds\./,
    );
  });
});

test("nonNegativeIntegerEnv rejects invalid queue numeric env values", () => {
  withEnv("QUEUE_JOB_BACKOFF_MS", "-1", () => {
    assert.throws(
      () =>
        nonNegativeIntegerEnv(
          "QUEUE_JOB_BACKOFF_MS",
          5_000,
          "non-negative integer milliseconds",
        ),
      /Invalid QUEUE_JOB_BACKOFF_MS: expected non-negative integer milliseconds\./,
    );
  });
});

test("integer env helpers keep valid numeric env values", () => {
  withEnv("WORKER_CONCURRENCY", "4", () => {
    assert.equal(
      positiveIntegerEnv(
        "WORKER_CONCURRENCY",
        2,
        "positive integer worker concurrency",
      ),
      4,
    );
  });

  withEnv("QUEUE_REMOVE_COMPLETE_COUNT", "0", () => {
    assert.equal(
      nonNegativeIntegerEnv(
        "QUEUE_REMOVE_COMPLETE_COUNT",
        1_000,
        "non-negative integer count",
      ),
      0,
    );
  });
});

test("validateProductionEnvironment rejects invalid QE runtime config env values", () => {
  withEnvValues(
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://placeholder",
      JWT_SECRET: "0123456789abcdef0123456789abcdef",
      ADMIN_PASSWORD: "placeholder-admin-password",
      VIEWER_PASSWORD: "placeholder-viewer-password",
      CORS_ORIGINS: "http://localhost",
      AUTH_ENABLED: "true",
      QE_SCANNER_MAX_DAILY_TRADES: "not-a-number",
    },
    () => {
      assert.throws(
        () => validateProductionEnvironment(),
        /Invalid runtime configuration environment variables: Invalid QE_SCANNER_MAX_DAILY_TRADES: expected finite number\./,
      );
    },
  );
});

function withEnv(name: string, value: string, run: () => void): void {
  withEnvValues({ [name]: value }, run);
}

function withEnvValues(values: Record<string, string>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  try {
    run();
  } finally {
    for (const [name, value] of previous) {
      if (value == null) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}
