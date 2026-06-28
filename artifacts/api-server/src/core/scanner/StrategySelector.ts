import { configService } from "../config";
import type { MarketRegime } from "../market";

export class StrategySelector {
  select(regime: MarketRegime): string {
    const config = configService.getSync().scannerDecision;
    const strategies: Record<MarketRegime, string> = {
      TRENDING_BULL: config.strategyTrendingBull,
      TRENDING_BEAR: config.strategyTrendingBear,
      SIDEWAYS: config.strategySideways,
      VOLATILE: config.strategyVolatile,
      COMPRESSION: config.strategyCompression,
      EXPANSION: config.strategyExpansion,
    };
    return strategies[regime];
  }
}
