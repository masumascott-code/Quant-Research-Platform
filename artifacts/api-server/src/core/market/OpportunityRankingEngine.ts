import type { MarketContext, RankedOpportunities } from "./types";

export class OpportunityRankingEngine {
  rank(contexts: MarketContext[]): RankedOpportunities {
    const ranked = [...contexts]
      .sort((a, b) => this.score(b) - this.score(a))
      .map((context, index) => ({ ...context, opportunityRank: index + 1 }));

    return {
      all: ranked,
      top5: ranked.slice(0, 5),
      top10: ranked.slice(0, 10),
      bestLong: ranked.find((context) => context.direction === "LONG") ?? null,
      bestShort: ranked.find((context) => context.direction === "SHORT") ?? null,
      highestConfidence: [...ranked].sort((a, b) => b.confidence - a.confidence)[0] ?? null,
      highestMomentum: [...ranked].sort((a, b) => b.trendScore + b.volumeScore - (a.trendScore + a.volumeScore))[0] ?? null,
    };
  }

  private score(context: MarketContext): number {
    return context.confidence * 0.45 +
      context.trendScore * 0.20 +
      context.volumeScore * 0.15 +
      context.liquidityScore * 0.10 +
      context.volatilityScore * 0.10;
  }
}
