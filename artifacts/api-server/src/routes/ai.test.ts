import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { createAIRouter, type AIRouteServices } from "./ai";
import type { AIContext, ParsedAIInsight, TradeContextSummary } from "../core/ai";

const insight: ParsedAIInsight = {
  summary: "Stay selective and manage risk.",
  strengths: ["Trend aligned"],
  weaknesses: ["Late entry"],
  riskFactors: ["Wide stop"],
  suggestedImprovements: ["Wait for confirmation"],
  alternativeScenarios: ["No-trade scenario was valid"],
  confidenceExplanation: "Confidence is based on available context.",
  rawText: "raw",
};

const context: AIContext = {
  generatedAt: "2026-06-29T00:00:00.000Z",
  market: {
    symbol: "BTCUSDT",
    marketRegime: "TRENDING",
    session: "ASIA",
    confidence: 82,
    liquidityScore: 74,
    trendScore: 81,
    volumeScore: 70,
    volatilityScore: 42,
    riskGrade: "MEDIUM",
  },
  portfolio: {
    dailyPnl: 120,
    winRate: 0.6,
    riskUsagePercent: 35,
  },
};

const trade: TradeContextSummary = {
  symbol: "BTCUSDT",
  direction: "LONG",
  status: "closed",
  setupType: "breakout_retest_long",
  entryPrice: 65000,
  stopLoss: 64250,
  tp1: 66000,
  tp2: 67000,
  tp3: 68000,
  quantity: 0.1,
  signalScore: 86,
  result: "WIN",
  pnl: 100,
  openedAt: new Date("2026-06-29T01:00:00.000Z"),
  closedAt: new Date("2026-06-29T02:00:00.000Z"),
};

test("AI mentor endpoint returns an advisory-only response from injected AI services", async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/ai/mentor?question=What%20should%20I%20improve`);
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.equal(body.advisoryOnly, true);
    assert.equal(body.question, "What should I improve");
    assert.equal(body.insight.summary, insight.summary);
  } finally {
    await close();
  }
});

test("AI trade-review endpoint explains trade sections without executing trades", async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/ai/trade-review?tradeId=T-1`);
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.equal(body.advisoryOnly, true);
    assert.equal(body.trade.symbol, "BTCUSDT");
    assert.equal(body.explain.entry, 65000);
    assert.deepEqual(body.explain.strengths, insight.strengths);
  } finally {
    await close();
  }
});

async function startTestServer() {
  const app = express();
  app.use("/api/ai", createAIRouter(fakeServices()));

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function fakeServices(): AIRouteServices {
  return {
    insight: {
      generateInsight: async () => insight,
    },
    mentor: {
      reviewTrade: async () => insight,
    },
    journal: {
      summarizeToday: async () => insight,
    },
    reports: {
      dailyReport: async () => insight,
      weeklyReport: async () => insight,
    },
    readModel: {
      platformContext: async () => context,
      dashboard: async () => ({
        context,
        widgets: {
          todayPerformance: {
            date: "2026-06-29",
            trades: 2,
            winRate: 0.5,
            pnl: 25,
          },
          winRate: 0.6,
          pnl: 120,
          risk: {
            grade: "MEDIUM",
            usagePercent: 35,
            marketRisk: "MEDIUM",
          },
          bestTrade: null,
          worstTrade: null,
          currentMarketRegime: "TRENDING",
          topOpportunities: [],
          journalSummary: {
            notes: [],
            lessons: [],
            recurringProblems: [],
          },
        },
      }),
      tradeReviewTarget: async () => trade,
      journal: async () => ({
        timeline: [],
        mistakes: [],
        lessons: [],
        recurringProblems: [],
        dailySummary: "Daily",
        weeklySummary: "Weekly",
      }),
      marketSummary: async () => ({
        currentRegime: "TRENDING",
        session: "ASIA",
        trend: 81,
        liquidity: 74,
        topMovers: [],
        marketRisk: "MEDIUM",
      }),
      strategyComparison: async () => ({
        strategies: [],
        bestStrategy: null,
        weakestStrategy: null,
      }),
    },
  };
}
