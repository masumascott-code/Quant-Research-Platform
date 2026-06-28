import { GoogleGenAI } from "@google/genai";
import { logger } from "../../lib/logger";
import type { AIRuntimeConfig } from "../config";
import { AICache } from "./AICache";
import { AITokenManager } from "./AITokenManager";
import type { AIProvider, AIRequest, AIResponse } from "./types";
import { AIProviderError } from "./types";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI | null = null;

  constructor(
    private readonly apiKey = process.env.GEMINI_API_KEY,
    private readonly cache = new AICache(),
    private readonly tokenManager = new AITokenManager(),
  ) {}

  async generate(request: AIRequest, config: AIRuntimeConfig): Promise<AIResponse> {
    if (!config.enabled) {
      throw new AIProviderError("AI provider is disabled by configuration", false);
    }
    if (!this.apiKey) {
      throw new AIProviderError("GEMINI_API_KEY is not configured", false);
    }

    const cacheKey = request.cacheKey ?? this.cache.keyFor({ request, model: config.modelName });
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    if (!this.tokenManager.canCall(config.rateLimitPerMinute)) {
      throw new AIProviderError(`AI rate limit exceeded. Try again in ${this.tokenManager.nextAvailableInMs(config.rateLimitPerMinute)}ms`, true);
    }

    const response = await this.withRetry(() => this.callGemini(request, config), config);
    this.cache.set(cacheKey, response, config.cacheTtlMs);
    return response;
  }

  private async callGemini(request: AIRequest, config: AIRuntimeConfig): Promise<AIResponse> {
    this.tokenManager.recordCall();
    const client = this.getClient();
    const contents = request.messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join("\n\n");
    const result = await this.withTimeout(
      client.models.generateContent({
        model: config.modelName,
        contents,
        config: {
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens,
        },
      }),
      config.timeoutMs,
    );

    return {
      text: result.text ?? "",
      model: config.modelName,
      cached: false,
      usage: {
        inputTokens: result.usageMetadata?.promptTokenCount,
        outputTokens: result.usageMetadata?.candidatesTokenCount,
        totalTokens: result.usageMetadata?.totalTokenCount,
      },
    };
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
    return this.client;
  }

  private async withRetry<T>(operation: () => Promise<T>, config: AIRuntimeConfig): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt >= config.retryCount || !this.isRetryable(error)) break;
        await sleep(config.retryDelayMs * (attempt + 1));
      }
    }
    logger.warn({ err: lastError }, "Gemini request failed");
    throw new AIProviderError("Gemini request failed", this.isRetryable(lastError), lastError);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new AIProviderError("Gemini request timed out", true)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof AIProviderError) return error.retryable;
    const status = typeof error === "object" && error ? (error as { status?: unknown }).status : null;
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
