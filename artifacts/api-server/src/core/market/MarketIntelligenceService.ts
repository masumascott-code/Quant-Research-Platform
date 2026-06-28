import { MarketContextBuilder } from "./MarketContextBuilder";
import { MarketRepository } from "./MarketRepository";
import { OpportunityRankingEngine } from "./OpportunityRankingEngine";
import type { MarketCandidate, MarketContext, MarketOverview, RankedOpportunities } from "./types";

export class MarketIntelligenceService {
  constructor(
    private readonly contextBuilder = new MarketContextBuilder(),
    private readonly rankingEngine = new OpportunityRankingEngine(),
    private readonly repository = new MarketRepository()
  ) {}

  async buildContext(candidate: MarketCandidate): Promise<MarketContext> {
    const context = this.contextBuilder.build(candidate);
    await this.repository.saveContext(context);
    return context;
  }

  async rankCandidates(candidates: MarketCandidate[]): Promise<RankedOpportunities> {
    const contexts = await Promise.all(candidates.map((candidate) => this.buildContext(candidate)));
    const rankings = this.rankingEngine.rank(contexts);
    await this.repository.saveRankings(rankings);
    return rankings;
  }

  generateOverview(contexts: MarketContext[]): MarketOverview {
    const byTrend = [...contexts].sort((a, b) => b.trendScore - a.trendScore);
    const sessionSummary = contexts.reduce<Record<string, number>>((summary, context) => {
      summary[context.session.session] = (summary[context.session.session] ?? 0) + 1;
      return summary;
    }, {});

    return {
      totalCandidates: contexts.length,
      strongestTrends: byTrend.slice(0, 5),
      weakestTrends: [...contexts].sort((a, b) => a.trendScore - b.trendScore).slice(0, 5),
      bestOpportunities: [...contexts].sort((a, b) => b.confidence - a.confidence).slice(0, 5),
      highestRiskAssets: [...contexts].sort((a, b) => this.riskValue(b.riskGrade) - this.riskValue(a.riskGrade)).slice(0, 5),
      sessionSummary,
    };
  }

  private riskValue(riskGrade: MarketContext["riskGrade"]): number {
    switch (riskGrade) {
      case "EXTREME": return 4;
      case "HIGH": return 3;
      case "MEDIUM": return 2;
      case "LOW": return 1;
    }
  }
}

export const marketIntelligenceService = new MarketIntelligenceService();
