import type { ParsedAIInsight } from "./types";

export class ResponseParser {
  parseInsight(text: string): ParsedAIInsight {
    const parsed = this.parseJsonObject(text);
    if (parsed) {
      return {
        summary: this.stringValue(parsed.summary) ?? text.trim(),
        strengths: this.stringArray(parsed.strengths),
        weaknesses: this.stringArray(parsed.weaknesses),
        riskFactors: this.stringArray(parsed.riskFactors),
        suggestedImprovements: this.stringArray(parsed.suggestedImprovements),
        alternativeScenarios: this.stringArray(parsed.alternativeScenarios),
        confidenceExplanation: this.stringValue(parsed.confidenceExplanation) ?? "",
        rawText: text,
      };
    }

    return {
      summary: text.trim(),
      strengths: [],
      weaknesses: [],
      riskFactors: [],
      suggestedImprovements: [],
      alternativeScenarios: [],
      confidenceExplanation: "",
      rawText: text,
    };
  }

  private parseJsonObject(text: string): Record<string, unknown> | null {
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      const value = JSON.parse(cleaned);
      return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  private stringValue(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }
}
