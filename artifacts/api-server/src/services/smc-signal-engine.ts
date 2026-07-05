import {
  calculatePremiumDiscount,
  calculateRiskPlan,
  calculateSmcScore,
  detectDisplacement,
  detectFairValueGaps,
  detectHtfBias,
  detectLiquiditySweep,
  detectOrderBlock,
  detectStructureEvents,
  isPriceInsidePoi,
  latestValidFvg,
  mapLiquidity,
  type FairValueGap,
  type HtfBias,
  type OrderBlock,
  type SmcAnalysisInput,
  type SmcDiagnostic,
  type SmcDirection,
  type SmcSignalAnalysis,
  type TradeDirection,
} from "../core/smc";
import { fibonacciConfluence } from "../core/indicators";

export function analyzeSmcSetup(input: SmcAnalysisInput): SmcSignalAnalysis {
  const direction = input.direction;
  const smcDirection = toSmcDirection(direction);
  const expectedBias = smcDirection;
  const biasSource = input.candles4h.length >= 20 ? input.candles4h : input.candles1h;
  const htfBias = detectHtfBias(biasSource);
  const levels = mapLiquidity(input.candles15m);
  const sweep = detectLiquiditySweep(input.candles5m, direction, mapLiquidity(input.candles5m));
  const displacement = detectDisplacement(input.candles5m, smcDirection, sweep?.index ?? Math.max(0, input.candles5m.length - 16));
  const structureEvents = detectStructureEvents(input.candles5m, 2, 2);
  const structureEvent = structureEvents
    .filter((event) => event.direction === smcDirection)
    .filter((event) => event.index >= (sweep?.index ?? 0))
    .sort((a, b) => b.index - a.index)[0] ?? null;
  const fvg = selectFvg(input.candles5m, smcDirection, displacement?.index ?? sweep?.index ?? 0);
  const orderBlock = displacement
    ? detectOrderBlock(input.candles5m, smcDirection, displacement.index)
    : null;
  const premiumDiscount = calculatePremiumDiscount(input.candles15m, direction, input.currentPrice);
  const fibConfluence = input.config.useFibonacciConfluence
    ? fibonacciConfluence(input.candles15m, input.currentPrice, direction, Math.min(input.candles15m.length, 120))
    : null;
  const plan = calculateRiskPlan({
    direction,
    currentPrice: input.currentPrice,
    sweep,
    orderBlock,
    fvg,
    liquidityLevels: levels,
    minRiskReward: input.config.minRiskReward,
  });
  const rr = plan?.rr ?? 0;
  const scoreBreakdown = calculateSmcScore({
    direction,
    htfBias,
    sweep,
    structureEvent,
    displacement,
    fvg,
    orderBlock,
    premiumDiscount,
    rr,
    minRiskReward: input.config.minRiskReward,
  });
  const poiInside = plan != null && isPriceInsidePoi(direction, input.currentPrice, fvg, orderBlock);
  const failures = rejectionReasons({
    direction,
    expectedBias,
    htfBias,
    sweep,
    structureEvent,
    displacement,
    fvg,
    orderBlock,
    premiumDiscount,
    plan,
    poiInside,
    config: input.config,
  });
  const score = round(scoreBreakdown.total);
  const canTrade = failures.length === 0 && score >= input.config.minSmcScoreTrade;
  const canWatchlist = !canTrade
    && score >= input.config.minSmcScoreWatchlist
    && input.config.allowWatchlistWithoutEntry
    && watchlistAllowed(failures);
  const decision = canTrade ? "ACCEPTED" : canWatchlist ? "WATCHLIST" : "REJECTED";
  const strategyLabel = strategyLabelFor(structureEvent?.type, fvg, orderBlock);
  const reason = decision === "ACCEPTED"
    ? `${strategyLabel} | SMC score ${score}/100 | RR ${rr.toFixed(2)}`
    : decision === "WATCHLIST"
      ? `${strategyLabel} watchlist | ${failures[0] ?? "Waiting for POI entry"} | SMC score ${score}/100`
      : failures[0] ?? "SMC setup incomplete";

  return {
    symbol: input.symbol,
    direction,
    decision,
    reason,
    score,
    grade: score >= 95 ? "A+" : score >= 80 ? "A" : score >= 65 ? "B" : null,
    confidence: confidenceFromScore(score),
    setupType: "SMC",
    strategyLabel,
    entryPrice: plan?.entry ?? input.currentPrice,
    stopLoss: plan?.stopLoss ?? 0,
    tp1: plan?.tp1 ?? 0,
    tp2: plan?.tp2 ?? 0,
    tp3: plan?.tp3 ?? 0,
    rrRatio: rr,
    slReason: plan
      ? `SMC invalidation ${direction === "LONG" ? "below sell-side sweep/OB" : "above buy-side sweep/OB"} at ${plan.stopLoss.toFixed(8)}.`
      : "No valid SMC stop-loss until sweep and POI are confirmed.",
    whyNow: buildWhyNow(htfBias, sweep, structureEvent, displacement, fvg, orderBlock, poiInside),
    whyNotEarlier: "Waited for liquidity sweep, displacement, structure confirmation, and POI/risk validation.",
    whyLong: direction === "LONG"
      ? "LONG requires sell-side liquidity sweep followed by bullish displacement and bullish BOS/CHOCH/MSS."
      : "SHORT setup selected; long conditions were not evaluated for this direction.",
    whySl: plan ? `Stop is placed beyond the swept liquidity/POI invalidation zone with RR ${rr.toFixed(2)}.` : "Stop is unavailable until full SMC sequence is present.",
    whyTp: plan ? `Targets are projected toward opposing liquidity with TP2 at ${plan.rr.toFixed(2)}R or better.` : "Targets are unavailable until risk plan is valid.",
    timeframeAlignment: `HTF bias ${htfBias}; execution ${direction}; 5m confirmation, 15m POI context.`,
    trendScore: scoreBreakdown.htfBias,
    emaScore: 0,
    volumeScore: displacement ? Math.min(15, displacement.rvol * 5) : 0,
    rvolScore: displacement ? Math.min(15, displacement.rvol * 5) : 0,
    breakoutScore: scoreBreakdown.structure,
    retestScore: poiInside ? 10 : 0,
    structureScore: scoreBreakdown.structure,
    momentumScore: scoreBreakdown.displacement,
    htfBias,
    sweep,
    structureEvent,
    displacement,
    fvg,
    orderBlock,
    premiumDiscount,
    scoreBreakdown,
    details: {
      source: "SMC",
      scannerType: "SMC_SCANNER",
      strategyType: "SMC",
      strategyLabel,
      badge: "SMC",
      htfBias,
      liquidityLevels: levels.slice(0, 8),
      sweep,
      displacement,
      structureEvent,
      fvg,
      orderBlock,
      premiumDiscount,
      fibonacci: fibConfluence,
      riskPlan: plan,
      poiInside,
      failures,
      scoreBreakdown,
    },
  };
}

export function toSmcDiagnostic(analysis: SmcSignalAnalysis): SmcDiagnostic {
  const fibonacci = analysis.details.fibonacci as { ote?: boolean; zone?: string; confluenceScore?: number; reason?: string } | null | undefined;
  return {
    symbol: analysis.symbol,
    direction: analysis.direction,
    decision: analysis.decision,
    source: "SMC",
    reason: analysis.reason,
    strategyLabel: analysis.strategyLabel,
    htfBias: analysis.htfBias,
    liquiditySweep: analysis.sweep ? `Sweep ${analysis.sweep.sweepDirection} ${analysis.sweep.sweptLevel}` : "No valid liquidity sweep",
    structure: analysis.structureEvent
      ? `${analysis.structureEvent.type} ${analysis.structureEvent.direction} ${analysis.structureEvent.brokenLevel}`
      : "No BOS/CHOCH/MSS confirmation",
    fvg: analysis.fvg ? `${analysis.fvg.direction} FVG ${analysis.fvg.lower}-${analysis.fvg.upper}` : "No valid FVG",
    orderBlock: analysis.orderBlock ? `${analysis.orderBlock.direction} OB ${analysis.orderBlock.low}-${analysis.orderBlock.high}` : "No valid Order Block",
    premiumDiscount: analysis.premiumDiscount
      ? `${analysis.premiumDiscount.zone} (${analysis.premiumDiscount.validForDirection ? "valid" : "invalid"})`
      : "No swing range",
    fibonacci: fibonacci
      ? `${fibonacci.zone ?? "unknown"} OTE=${fibonacci.ote === true ? "yes" : "no"} score=${fibonacci.confluenceScore ?? 0}`
      : "Not enabled",
    riskReward: analysis.rrRatio > 0 ? `${analysis.rrRatio.toFixed(2)}R` : "No valid RR",
    smcScore: analysis.score,
    paperTradeOpened: false,
    paperTradeId: null,
    paperTradeBlockedReason: null,
    details: analysis.details,
  };
}

function rejectionReasons(params: {
  direction: TradeDirection;
  expectedBias: SmcDirection;
  htfBias: HtfBias;
  sweep: unknown;
  structureEvent: unknown;
  displacement: unknown;
  fvg: unknown;
  orderBlock: unknown;
  premiumDiscount: { validForDirection: boolean } | null;
  plan: { rr: number } | null;
  poiInside: boolean;
  config: SmcAnalysisInput["config"];
}): string[] {
  const reasons: string[] = [];
  const biasConflicts = params.htfBias !== "neutral" && params.htfBias !== params.expectedBias;
  if (params.config.requireHtfBias && params.htfBias !== params.expectedBias) {
    reasons.push(biasConflicts ? "HTF bias conflicts with setup" : "HTF bias is neutral");
  } else if (biasConflicts) {
    reasons.push("HTF bias conflicts with setup");
  }
  if (params.config.requireLiquiditySweep && !params.sweep) reasons.push("No valid liquidity sweep");
  if (!params.displacement) reasons.push("No valid displacement");
  if (params.config.requireBOSorCHOCH && !params.structureEvent) reasons.push("No BOS/CHOCH confirmation");
  if (params.config.requireFvgOrOrderBlock && !params.fvg && !params.orderBlock) reasons.push("No valid FVG or Order Block");
  if (params.config.requirePremiumDiscount && !params.premiumDiscount?.validForDirection) {
    reasons.push("Premium/discount requirement not met");
  }
  if (!params.plan) reasons.push("No valid entry/SL/TP risk plan");
  else if (params.plan.rr < params.config.minRiskReward) reasons.push("RR below minimum");
  if (params.plan && !params.poiInside) reasons.push("Price not inside POI");
  return reasons;
}

function watchlistAllowed(failures: string[]): boolean {
  const hardFailures = new Set([
    "HTF bias conflicts with setup",
    "No valid liquidity sweep",
    "No BOS/CHOCH confirmation",
    "No valid FVG or Order Block",
    "RR below minimum",
  ]);
  return failures.every((failure) => !hardFailures.has(failure));
}

function selectFvg(candles: SmcAnalysisInput["candles5m"], direction: SmcDirection, afterIndex: number): FairValueGap | null {
  return latestValidFvg(candles, direction, afterIndex)
    ?? detectFairValueGaps(candles).filter((gap) => gap.direction === direction).sort((a, b) => b.score - a.score)[0]
    ?? null;
}

function strategyLabelFor(structureType: string | undefined, fvg: FairValueGap | null, orderBlock: OrderBlock | null): string {
  const structure = structureType ?? "CHOCH";
  if (fvg && (!orderBlock || fvg.score >= orderBlock.score)) return `SMC Liquidity Sweep + ${structure} + FVG`;
  return `SMC Liquidity Sweep + ${structure} + Order Block`;
}

function buildWhyNow(
  htfBias: HtfBias,
  sweep: unknown,
  structureEvent: { type: string } | null,
  displacement: unknown,
  fvg: unknown,
  orderBlock: unknown,
  poiInside: boolean,
): string {
  const parts = [`HTF bias: ${htfBias}`];
  if (sweep) parts.push("liquidity swept");
  if (displacement) parts.push("displacement confirmed");
  if (structureEvent) parts.push(`${structureEvent.type} confirmed`);
  if (fvg) parts.push("FVG available");
  if (orderBlock) parts.push("Order Block available");
  if (poiInside) parts.push("price is inside/near POI");
  return parts.join("; ");
}

function confidenceFromScore(score: number): SmcSignalAnalysis["confidence"] {
  if (score >= 97) return "Extreme";
  if (score >= 90) return "Very High";
  if (score >= 80) return "High";
  if (score >= 65) return "Medium";
  return "Low";
}

function toSmcDirection(direction: TradeDirection): SmcDirection {
  return direction === "LONG" ? "bullish" : "bearish";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
