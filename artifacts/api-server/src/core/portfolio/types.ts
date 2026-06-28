import type { PositionSizingPlan } from "./PositionSizingService";

export interface AccountSnapshot {
  accountId: number | null;
  accountType: "paper" | "spot" | "futures";
  currency: string;
  equity: number;
  availableBalance: number;
  usedMargin: number;
  freeMargin: number;
  leverage: number;
}

export interface PortfolioSummary {
  currency: string;
  equity: number;
  availableBalance: number;
  usedMargin: number;
  freeMargin: number;
  dailyPnl: number;
  openExposure: number;
  openTrades: number;
  winRate: number;
  riskUsagePercent: number;
}

export interface PortfolioApproval {
  approved: boolean;
  reason: string | null;
  account: AccountSnapshot;
  sizing: PositionSizingPlan | null;
  summary: PortfolioSummary;
}
