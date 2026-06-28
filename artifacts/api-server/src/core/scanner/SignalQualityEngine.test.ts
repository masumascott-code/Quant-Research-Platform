import assert from "node:assert/strict";
import test from "node:test";
import { SignalQualityEngine } from "./SignalQualityEngine";

test("SignalQualityEngine classifies scores and rejections", () => {
  const engine = new SignalQualityEngine();
  assert.equal(engine.classify(96, false), "A+");
  assert.equal(engine.classify(91, false), "A");
  assert.equal(engine.classify(83, false), "B");
  assert.equal(engine.classify(70, false), "C");
  assert.equal(engine.classify(99, true), "Rejected");
});
