import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expectedRoutes = [
  "/ai/dashboard",
  "/ai/mentor",
  "/ai/trade-review",
  "/ai/journal",
  "/ai/daily-report",
  "/ai/weekly-report",
  "/ai/market-summary",
  "/ai/strategy-review",
];

test("AI pages are registered in the application router", async () => {
  const appSource = await readFile(new URL("../App.tsx", import.meta.url), "utf8");

  for (const route of expectedRoutes) {
    assert.match(appSource, new RegExp(`path="${route}"`));
  }
});

test("AI pages are reachable from the sidebar navigation", async () => {
  const sidebarSource = await readFile(new URL("../components/layout/sidebar.tsx", import.meta.url), "utf8");

  for (const route of expectedRoutes) {
    assert.match(sidebarSource, new RegExp(`path: "${route}"`));
  }
});
