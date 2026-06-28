import type { AIContext, AIMessage, AIPromptTemplate } from "./types";

const SYSTEM_PROMPT = [
  "You are QUANTEDGE AI Mentor, an advisory quant research assistant.",
  "You must never place trades, reject trades, instruct trade execution, or override risk controls.",
  "Use only the structured context provided. Do not infer secrets or request credentials.",
  "Return practical analysis for research and review.",
].join("\n");

const TEMPLATE_INSTRUCTIONS: Record<AIPromptTemplate, string> = {
  TRADE_REVIEW: "Review the trade decision. Explain why it was taken, strengths, weaknesses, risks, improvements, alternatives, and confidence.",
  TRADE_EXPLANATION: "Explain the trade in plain language for a trader reviewing the setup.",
  DAILY_REPORT: "Create a daily trading report covering market summary, best/worst signals, performance, win rate, PnL, risk, and lessons learned.",
  WEEKLY_REPORT: "Create a weekly report covering trends, strategy comparison, regimes, profitable setups, weak setups, and recommendations.",
  MISTAKE_DETECTION: "Detect repeated mistakes, risk issues, execution mistakes, and process improvements.",
  STRATEGY_REVIEW: "Review strategy quality, robustness, weaknesses, and improvements.",
  MARKET_SUMMARY: "Summarize market conditions, regimes, liquidity, volume, volatility, and risk.",
  PERFORMANCE_ANALYSIS: "Analyze performance metrics, expectancy, drawdown, win rate, and risk-adjusted quality.",
};

export class PromptBuilder {
  build(template: AIPromptTemplate, context: AIContext, userInstruction?: string): AIMessage[] {
    return [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          TEMPLATE_INSTRUCTIONS[template],
          "Respond as JSON with keys: summary, strengths, weaknesses, riskFactors, suggestedImprovements, alternativeScenarios, confidenceExplanation.",
          userInstruction ? `Additional instruction: ${this.sanitize(userInstruction)}` : "",
          "Structured context:",
          JSON.stringify(this.sanitizeContext(context), null, 2),
        ].filter(Boolean).join("\n\n"),
      },
    ];
  }

  sanitize(value: string): string {
    return value
      .replace(/GEMINI_API_KEY\s*=\s*\S+/gi, "GEMINI_API_KEY=[REDACTED]")
      .replace(/JWT_SECRET\s*=\s*\S+/gi, "JWT_SECRET=[REDACTED]")
      .replace(/DATABASE_URL\s*=\s*\S+/gi, "DATABASE_URL=[REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");
  }

  private sanitizeContext(context: AIContext): AIContext {
    return JSON.parse(this.sanitize(JSON.stringify(context))) as AIContext;
  }
}
