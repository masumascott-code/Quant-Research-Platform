import type { PaperTradeRecord } from "../trading";

export class EquityService {
  calculateEquity(defaultEquity: number, closedTrades: PaperTradeRecord[]): number {
    return defaultEquity + closedTrades.reduce((sum, trade) => sum + Number(trade.pnl ?? 0), 0);
  }

  calculateDailyPnl(todayClosedTrades: PaperTradeRecord[]): number {
    return todayClosedTrades.reduce((sum, trade) => sum + Number(trade.pnl ?? 0), 0);
  }

  calculateWinRate(closedTrades: PaperTradeRecord[]): number {
    if (closedTrades.length === 0) return 0;
    const wins = closedTrades.filter((trade) => trade.result === "WIN").length;
    return wins / closedTrades.length;
  }
}
