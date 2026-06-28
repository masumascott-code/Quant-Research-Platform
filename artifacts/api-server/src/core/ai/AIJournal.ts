import { ContextBuilder } from "./ContextBuilder";
import { AIInsightService } from "./AIInsightService";
import type { ParsedAIInsight } from "./types";

export class AIJournal {
  constructor(
    private readonly contextBuilder = new ContextBuilder(),
    private readonly insights = new AIInsightService(),
  ) {}

  async summarizeToday(notes: string[] = []): Promise<ParsedAIInsight> {
    const context = await this.contextBuilder.buildPlatformContext({
      includeJournal: { notes },
    });
    return await this.insights.generateInsight({
      template: "MISTAKE_DETECTION",
      context,
      instruction: "Summarize today's trades, mistakes, best setups, worst setups, repeated errors, and improvement suggestions.",
    });
  }
}

export const aiJournal = new AIJournal();
