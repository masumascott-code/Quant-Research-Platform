import assert from "node:assert/strict";
import test from "node:test";
import { ResponseParser } from "./ResponseParser";

test("ResponseParser parses structured AI insight JSON", () => {
  const insight = new ResponseParser().parseInsight(JSON.stringify({
    summary: "Good setup",
    strengths: ["trend"],
    weaknesses: ["late entry"],
    riskFactors: ["volatility"],
    suggestedImprovements: ["wait for retest"],
    alternativeScenarios: ["range continuation"],
    confidenceExplanation: "High confluence",
  }));

  assert.equal(insight.summary, "Good setup");
  assert.deepEqual(insight.strengths, ["trend"]);
  assert.deepEqual(insight.riskFactors, ["volatility"]);
});
