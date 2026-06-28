import { configService } from "../config";
import { MarginCalculator } from "./MarginCalculator";
import { EquityService } from "./EquityService";
import { PortfolioRepository } from "./PortfolioRepository";
import type { AccountSnapshot } from "./types";

export class AccountService {
  constructor(
    private readonly repository = new PortfolioRepository(),
    private readonly equityService = new EquityService(),
    private readonly marginCalculator = new MarginCalculator()
  ) {}

  async getSnapshot(): Promise<AccountSnapshot> {
    const config = await configService.get();
    const [openTrades, closedTrades] = await Promise.all([
      this.repository.getOpenTrades(),
      this.repository.getClosedTrades(),
    ]);

    const equity = this.equityService.calculateEquity(config.paperTrading.defaultEquity, closedTrades);
    const usedMargin = openTrades.reduce((sum, trade) => {
      const margin = this.marginCalculator.estimate({
        entryPrice: Number(trade.entryPrice),
        quantity: Number(trade.quantity),
        leverage: config.paperTrading.defaultLeverage,
        feeRate: config.paperTrading.tradingFeeRate,
        slippageRate: config.paperTrading.slippageRate,
        fundingRate: config.paperTrading.fundingRate,
      });
      return sum + margin.initialMargin;
    }, 0);
    const freeMargin = Math.max(equity - usedMargin, 0);

    const snapshot: AccountSnapshot = {
      accountId: null,
      accountType: "paper",
      currency: "USDT",
      equity,
      availableBalance: freeMargin,
      usedMargin,
      freeMargin,
      leverage: config.paperTrading.defaultLeverage,
    };
    snapshot.accountId = await this.repository.ensurePaperAccount(snapshot);
    return snapshot;
  }
}
