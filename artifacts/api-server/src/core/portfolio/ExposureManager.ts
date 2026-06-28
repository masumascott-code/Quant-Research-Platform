import type { PaperTradeRecord } from "../trading";
import type { PositionSizingPlan } from "./PositionSizingService";
import { CorrelationManager } from "./CorrelationManager";
import { RiskCalculator } from "./RiskCalculator";

export interface ExposureSummary {
  openTrades: number;
  openExposure: number;
  exposurePercent: number;
  openRisk: number;
  portfolioRiskPercent: number;
}

export class ExposureManager {
  constructor(
    private readonly correlationManager = new CorrelationManager(),
    private readonly riskCalculator = new RiskCalculator()
  ) {}

  summarize(openTrades: PaperTradeRecord[], equity: number): ExposureSummary {
    const openExposure = openTrades.reduce((sum, trade) => {
      return sum + Number(trade.entryPrice) * Number(trade.quantity);
    }, 0);
    const openRisk = openTrades.reduce((sum, trade) => {
      return sum + this.riskCalculator.tradeRisk({
        entryPrice: Number(trade.entryPrice),
        stopLoss: Number(trade.currentSl ?? trade.stopLoss),
        quantity: Number(trade.quantity),
      });
    }, 0);

    return {
      openTrades: openTrades.length,
      openExposure,
      exposurePercent: equity > 0 ? (openExposure / equity) * 100 : 0,
      openRisk,
      portfolioRiskPercent: equity > 0 ? (openRisk / equity) * 100 : 0,
    };
  }

  validate(params: {
    symbol: string;
    openTrades: PaperTradeRecord[];
    equity: number;
    plan: PositionSizingPlan;
    maxOpenTrades: number;
    maxExposurePercent: number;
    maxPortfolioRiskPercent: number;
    maxAccountRiskPercent: number;
    maxSectorExposurePercent: number;
    maxCoinExposurePercent: number;
  }): string | null {
    if (params.openTrades.length >= params.maxOpenTrades) {
      return `Maximum open trades reached (${params.maxOpenTrades})`;
    }

    if (this.correlationManager.hasDuplicatePosition(params.openTrades, params.symbol)) {
      return `Duplicate open position exists for ${params.symbol}`;
    }

    const summary = this.summarize(params.openTrades, params.equity);
    const nextExposurePercent = params.equity > 0
      ? ((summary.openExposure + params.plan.notional) / params.equity) * 100
      : 0;
    if (nextExposurePercent > params.maxExposurePercent) {
      return `Maximum exposure exceeded (${nextExposurePercent.toFixed(2)}% > ${params.maxExposurePercent}%)`;
    }

    const nextRiskPercent = params.equity > 0
      ? ((summary.openRisk + params.plan.riskAmount) / params.equity) * 100
      : 0;
    if (nextRiskPercent > params.maxPortfolioRiskPercent) {
      return `Maximum portfolio risk exceeded (${nextRiskPercent.toFixed(2)}% > ${params.maxPortfolioRiskPercent}%)`;
    }
    if (nextRiskPercent > params.maxAccountRiskPercent) {
      return `Maximum account risk exceeded (${nextRiskPercent.toFixed(2)}% > ${params.maxAccountRiskPercent}%)`;
    }

    const symbolExposure = params.openTrades
      .filter((trade) => trade.symbol.toUpperCase() === params.symbol.toUpperCase())
      .reduce((sum, trade) => sum + Number(trade.entryPrice) * Number(trade.quantity), 0);
    const nextCoinExposurePercent = params.equity > 0
      ? ((symbolExposure + params.plan.notional) / params.equity) * 100
      : 0;
    if (nextCoinExposurePercent > params.maxCoinExposurePercent) {
      return `Maximum coin exposure exceeded (${nextCoinExposurePercent.toFixed(2)}% > ${params.maxCoinExposurePercent}%)`;
    }

    const sector = this.correlationManager.sectorForSymbol(params.symbol);
    const sectorExposure = params.openTrades
      .filter((trade) => this.correlationManager.sectorForSymbol(trade.symbol) === sector)
      .reduce((sum, trade) => sum + Number(trade.entryPrice) * Number(trade.quantity), 0);
    const nextSectorExposurePercent = params.equity > 0
      ? ((sectorExposure + params.plan.notional) / params.equity) * 100
      : 0;
    if (nextSectorExposurePercent > params.maxSectorExposurePercent) {
      return `Maximum sector exposure exceeded (${nextSectorExposurePercent.toFixed(2)}% > ${params.maxSectorExposurePercent}%)`;
    }

    return null;
  }
}
