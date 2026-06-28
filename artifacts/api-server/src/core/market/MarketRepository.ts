import {
  db,
  marketContextTable,
  marketRegimeTable,
  marketSessionsTable,
  opportunityRankingsTable,
} from "@workspace/db";
import { logger } from "../../lib/logger";
import type { MarketContext, RankedOpportunities } from "./types";

export class MarketRepository {
  async saveContext(context: MarketContext): Promise<void> {
    try {
      await db.insert(marketContextTable).values({
        symbol: context.symbol,
        marketRegime: context.marketRegime.regime,
        session: context.session.session,
        confidence: String(context.confidence),
        liquidityScore: String(context.liquidityScore),
        trendScore: String(context.trendScore),
        volumeScore: String(context.volumeScore),
        volatilityScore: String(context.volatilityScore),
        opportunityRank: context.opportunityRank == null ? null : String(context.opportunityRank),
        riskGrade: context.riskGrade,
        context: context as unknown as Record<string, unknown>,
      });
      await db.insert(marketRegimeTable).values({
        symbol: context.symbol,
        regime: context.marketRegime.regime,
        strength: String(context.marketRegime.strength),
        confidence: String(context.marketRegime.confidence),
      });
      await db.insert(marketSessionsTable).values({
        session: context.session.session,
        overlap: context.session.overlap,
        qualityScore: String(context.session.qualityScore),
      });
    } catch (err) {
      logger.warn({ err, symbol: context.symbol }, "Failed to persist market context");
    }
  }

  async saveRankings(rankings: RankedOpportunities): Promise<void> {
    try {
      for (const context of rankings.all) {
        await db.insert(opportunityRankingsTable).values({
          symbol: context.symbol,
          direction: context.direction,
          rank: String(context.opportunityRank ?? 0),
          confidence: String(context.confidence),
          momentumScore: String(context.trendScore + context.volumeScore),
          riskGrade: context.riskGrade,
          context: context as unknown as Record<string, unknown>,
        });
      }
    } catch (err) {
      logger.warn({ err }, "Failed to persist opportunity rankings");
    }
  }
}
