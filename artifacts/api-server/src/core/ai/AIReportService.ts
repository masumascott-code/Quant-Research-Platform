import { ContextBuilder } from "./ContextBuilder";
import { AIInsightService } from "./AIInsightService";
import type { ParsedAIInsight } from "./types";

export class AIReportService {
  constructor(
    private readonly contextBuilder = new ContextBuilder(),
    private readonly insights = new AIInsightService(),
  ) {}

  async dailyReport(): Promise<ParsedAIInsight> {
    const context = await this.contextBuilder.buildPlatformContext();
    return await this.insights.generateInsight({
      template: "DAILY_REPORT",
      context,
      instruction: "Include market summary, best signals, worst signals, performance, win rate, PnL, risk, and lessons learned.",
    });
  }

  async weeklyReport(): Promise<ParsedAIInsight> {
    const context = await this.contextBuilder.buildPlatformContext();
    return await this.insights.generateInsight({
      template: "WEEKLY_REPORT",
      context,
      instruction: "Include performance trends, strategy comparison, market regimes, most and least profitable setups, and recommendations.",
    });
  }
}

export const aiReportService = new AIReportService();
