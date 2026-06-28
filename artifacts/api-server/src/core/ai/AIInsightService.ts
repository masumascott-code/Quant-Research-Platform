import { configService } from "../config";
import { ContextBuilder } from "./ContextBuilder";
import { GeminiProvider } from "./GeminiProvider";
import { PromptBuilder } from "./PromptBuilder";
import { ResponseParser } from "./ResponseParser";
import type { AIContext, AIProvider, AIPromptTemplate, ParsedAIInsight } from "./types";

export class AIInsightService {
  constructor(
    private readonly provider: AIProvider = new GeminiProvider(),
    private readonly contextBuilder = new ContextBuilder(),
    private readonly promptBuilder = new PromptBuilder(),
    private readonly parser = new ResponseParser(),
  ) {}

  async generateInsight(params: {
    template: AIPromptTemplate;
    context?: AIContext;
    symbol?: string;
    instruction?: string;
  }): Promise<ParsedAIInsight> {
    const config = (await configService.get()).ai;
    const context = params.context ?? await this.contextBuilder.buildPlatformContext({ symbol: params.symbol });
    const messages = this.promptBuilder.build(params.template, context, params.instruction);
    const response = await this.provider.generate({
      template: params.template,
      messages,
      cacheKey: params.context
        ? undefined
        : `${params.template}:${params.symbol ?? "platform"}:${JSON.stringify(context)}`,
      metadata: { advisoryOnly: true },
    }, config);
    return this.parser.parseInsight(response.text);
  }
}

export const aiInsightService = new AIInsightService();
