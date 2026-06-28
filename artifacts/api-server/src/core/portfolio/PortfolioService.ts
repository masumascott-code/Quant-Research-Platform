import { logger } from "../../lib/logger";
import { configService } from "../config";
import type { TradeAnalysisInput, TradeSignalInput, PaperTradeRecord } from "../trading";
import { AccountService } from "./AccountService";
import { EquityService } from "./EquityService";
import { ExposureManager } from "./ExposureManager";
import { PortfolioRepository } from "./PortfolioRepository";
import { PositionSizingService } from "./PositionSizingService";
import { RiskCalculator } from "./RiskCalculator";
import type { PortfolioApproval, PortfolioSummary } from "./types";

export class PortfolioService {
  constructor(
    private readonly repository = new PortfolioRepository(),
    private readonly accountService = new AccountService(repository),
    private readonly equityService = new EquityService(),
    private readonly exposureManager = new ExposureManager(),
    private readonly positionSizingService = new PositionSizingService(),
    private readonly riskCalculator = new RiskCalculator()
  ) {}

  async validateTrade(signal: TradeSignalInput, analysis: TradeAnalysisInput): Promise<PortfolioApproval> {
    const config = await configService.get();
    const [account, openTrades, closedTrades, todayClosedTrades] = await Promise.all([
      this.accountService.getSnapshot(),
      this.repository.getOpenTrades(),
      this.repository.getClosedTrades(),
      this.repository.getTodayClosedTrades(),
    ]);
    const summary = this.buildSummary(account, openTrades, closedTrades, todayClosedTrades);

    if (config.risk.killSwitch) {
      return this.reject("Kill switch active", account, summary);
    }

    const dailyLossPercent = this.riskCalculator.dailyLossPercent(account.equity, summary.dailyPnl);
    if (dailyLossPercent >= config.risk.dailyDrawdownLimitPercent) {
      return this.reject(
        `Maximum daily loss exceeded (${dailyLossPercent.toFixed(2)}% >= ${config.risk.dailyDrawdownLimitPercent}%)`,
        account,
        summary
      );
    }

    const drawdownPercent = this.riskCalculator.drawdownPercent(config.paperTrading.defaultEquity, account.equity);
    if (drawdownPercent >= config.risk.maxDrawdownPercent) {
      return this.reject(
        `Maximum drawdown exceeded (${drawdownPercent.toFixed(2)}% >= ${config.risk.maxDrawdownPercent}%)`,
        account,
        summary
      );
    }

    let sizing;
    try {
      sizing = this.positionSizingService.calculate({
        equity: account.equity,
        riskPercent: config.risk.riskPercent,
        entryPrice: analysis.entryPrice,
        stopLoss: analysis.stopLoss,
        leverage: config.paperTrading.defaultLeverage,
        feeRate: config.paperTrading.tradingFeeRate,
        slippageRate: config.paperTrading.slippageRate,
        fundingRate: config.paperTrading.fundingRate,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Position sizing failed";
      return this.reject(reason, account, summary);
    }

    if (sizing.estimatedEntryCost > account.freeMargin) {
      return this.reject(
        `Insufficient free margin (${sizing.estimatedEntryCost.toFixed(4)} required, ${account.freeMargin.toFixed(4)} available)`,
        account,
        summary,
        sizing
      );
    }

    const exposureReason = this.exposureManager.validate({
      symbol: signal.symbol,
      openTrades,
      equity: account.equity,
      plan: sizing,
      maxOpenTrades: config.scanner.maxOpenTrades,
      maxExposurePercent: config.risk.maxExposurePercent,
      maxPortfolioRiskPercent: config.risk.maxPortfolioRiskPercent,
      maxAccountRiskPercent: config.risk.maxAccountRiskPercent,
      maxSectorExposurePercent: config.risk.maxSectorExposurePercent,
      maxCoinExposurePercent: config.risk.maxCoinExposurePercent,
    });
    if (exposureReason) {
      return this.reject(exposureReason, account, summary, sizing);
    }

    return { approved: true, reason: null, account, sizing, summary };
  }

  async recordTradeOpened(trade: PaperTradeRecord, sizing: NonNullable<PortfolioApproval["sizing"]>): Promise<void> {
    const account = await this.accountService.getSnapshot();
    await this.repository.recordTradeOpened(account.accountId, trade, sizing);
    const summary = await this.getSummary();
    await this.repository.recordEquitySnapshot(account.accountId, account, summary.dailyPnl);
    await this.repository.recordPortfolioSnapshot(account.accountId, summary);
  }

  async recordTradeClosed(trade: PaperTradeRecord): Promise<void> {
    await this.repository.recordTradeClosed(trade);
    const account = await this.accountService.getSnapshot();
    const summary = await this.getSummary();
    await this.repository.recordEquitySnapshot(account.accountId, account, summary.dailyPnl);
    await this.repository.recordPortfolioSnapshot(account.accountId, summary);
  }

  async getSummary(): Promise<PortfolioSummary> {
    const [account, openTrades, closedTrades, todayClosedTrades] = await Promise.all([
      this.accountService.getSnapshot(),
      this.repository.getOpenTrades(),
      this.repository.getClosedTrades(),
      this.repository.getTodayClosedTrades(),
    ]);
    return this.buildSummary(account, openTrades, closedTrades, todayClosedTrades);
  }

  private buildSummary(
    account: Awaited<ReturnType<AccountService["getSnapshot"]>>,
    openTrades: PaperTradeRecord[],
    closedTrades: PaperTradeRecord[],
    todayClosedTrades: PaperTradeRecord[]
  ): PortfolioSummary {
    const exposure = this.exposureManager.summarize(openTrades, account.equity);
    const dailyPnl = this.equityService.calculateDailyPnl(todayClosedTrades);
    const winRate = this.equityService.calculateWinRate(closedTrades);

    return {
      currency: account.currency,
      equity: account.equity,
      availableBalance: account.availableBalance,
      usedMargin: account.usedMargin,
      freeMargin: account.freeMargin,
      dailyPnl,
      openExposure: exposure.openExposure,
      openTrades: exposure.openTrades,
      winRate,
      riskUsagePercent: exposure.portfolioRiskPercent,
    };
  }

  private reject(
    reason: string,
    account: PortfolioApproval["account"],
    summary: PortfolioSummary,
    sizing: PortfolioApproval["sizing"] = null
  ): PortfolioApproval {
    logger.warn({ reason }, "Portfolio rejected trade");
    return { approved: false, reason, account, summary, sizing };
  }
}

export const portfolioService = new PortfolioService();
