process.env.LOAD_TEST_CONCURRENCY ??= "50";
process.env.LOAD_TEST_DURATION_MS ??= "60000";
await import("./load-test");

export {};
