import type { AIContext, ParsedAIInsight, TradeContextSummary } from "./types";
import { AIInsightService } from "./AIInsightService";

export class AIMentor {
  constructor(private readonly insights = new AIInsightService()) {}

  async reviewTrade(trade: TradeContextSummary, context?: AIContext): Promise<ParsedAIInsight> {
    return await this.insights.generateInsight({
      template: "TRADE_REVIEW",
      context: context
        ? { ...context, openTrades: [trade] }
        : undefined,
      symbol: trade.symbol,
      instruction: "Focus on why the trade was taken, strengths, weaknesses, risk factors, suggested improvements, alternatives, and confidence explanation. Advisory only.",
    });
  }

  async explainTrade(trade: TradeContextSummary, context?: AIContext): Promise<ParsedAIInsight> {
    return await this.insights.generateInsight({
      template: "TRADE_EXPLANATION",
      context: context
        ? { ...context, openTrades: [trade] }
        : undefined,
      symbol: trade.symbol,
      instruction: "Explain the setup without recommending execution. Do not place, reject, or modify trades.",
    });
  }
}

export const aiMentor = new AIMentor();
