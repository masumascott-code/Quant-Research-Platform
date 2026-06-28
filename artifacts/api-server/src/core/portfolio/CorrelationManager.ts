import type { PaperTradeRecord } from "../trading";

export class CorrelationManager {
  hasDuplicatePosition(openTrades: PaperTradeRecord[], symbol: string): boolean {
    return openTrades.some((trade) => trade.symbol.toUpperCase() === symbol.toUpperCase());
  }

  sectorForSymbol(_symbol: string): string {
    return "crypto";
  }
}
