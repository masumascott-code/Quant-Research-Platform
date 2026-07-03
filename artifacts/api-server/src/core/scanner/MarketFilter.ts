import { configService } from "../config";
import type { MarketFilterInput, MarketFilterResult } from "./types";

const RISK_ORDER = { LOW: 1, MEDIUM: 2, HIGH: 3, EXTREME: 4 } as const;

export class MarketFilter {
  evaluate(input: MarketFilterInput): MarketFilterResult {
    const config = configService.getSync().scannerDecision;
    const rejectedReasons: string[] = [];
    const riskSummary: string[] = [];

    if (input.context.confidence < config.minConfidence) {
      rejectedReasons.push(`Confidence below threshold (${input.context.confidence.toFixed(2)} < ${config.minConfidence})`);
    }
    if (input.context.liquidityScore < config.minLiquidityScore) {
      rejectedReasons.push(`Liquidity below minimum (${input.context.liquidityScore.toFixed(2)} < ${config.minLiquidityScore})`);
    }
    if (RISK_ORDER[input.context.riskGrade] > RISK_ORDER[config.maxRiskGrade]) {
      rejectedReasons.push(`Risk grade too high (${input.context.riskGrade} > ${config.maxRiskGrade})`);
    }
    if (input.context.session.qualityScore < config.minSessionQuality) {
      rejectedReasons.push(`Session quality too low (${input.context.session.qualityScore.toFixed(2)} < ${config.minSessionQuality})`);
    }
    if (input.context.volatilityScore < config.minVolatilityScore || input.context.volatilityScore > config.maxVolatilityScore) {
      rejectedReasons.push(`Volatility outside allowed range (${input.context.volatilityScore.toFixed(2)})`);
    }
    if (!input.portfolioAllowed) {
      rejectedReasons.push(input.portfolioReason ?? "Portfolio exposure would be exceeded");
    }

    riskSummary.push(`Risk grade: ${input.context.riskGrade}`);
    riskSummary.push(`Volatility score: ${input.context.volatilityScore.toFixed(2)}`);
    riskSummary.push(`Liquidity score: ${input.context.liquidityScore.toFixed(2)}`);

    return { accepted: rejectedReasons.length === 0, rejectedReasons, riskSummary };
  }
}
