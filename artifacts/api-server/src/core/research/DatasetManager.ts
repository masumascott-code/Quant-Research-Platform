import type { HistoricalDataset, OHLCVBar, ReplayFrame, TickData } from "./types";

export class DatasetManager {
  normalize(dataset: HistoricalDataset): HistoricalDataset {
    return {
      ...dataset,
      bars: this.sortBars(dataset.bars),
      ticks: dataset.ticks ? this.sortTicks(dataset.ticks) : undefined,
      higherTimeframes: dataset.higherTimeframes
        ? Object.fromEntries(Object.entries(dataset.higherTimeframes).map(([timeframe, bars]) => [timeframe, this.sortBars(bars)]))
        : undefined,
    };
  }

  replay(dataset: HistoricalDataset): ReplayFrame[] {
    const normalized = this.normalize(dataset);
    return normalized.bars.map((bar, index) => ({
      symbol: normalized.symbol,
      timestamp: bar.timestamp,
      primary: bar,
      multiTimeframe: this.snapshotHigherTimeframes(normalized.higherTimeframes ?? {}, bar.timestamp),
      tick: this.latestTick(normalized.ticks ?? [], bar.timestamp),
      index,
    }));
  }

  slice(dataset: HistoricalDataset, start: Date, end: Date): HistoricalDataset {
    const inRange = <T extends { timestamp: Date }>(value: T) => value.timestamp >= start && value.timestamp <= end;
    return {
      ...dataset,
      bars: dataset.bars.filter(inRange),
      ticks: dataset.ticks?.filter(inRange),
      higherTimeframes: dataset.higherTimeframes
        ? Object.fromEntries(Object.entries(dataset.higherTimeframes).map(([timeframe, bars]) => [timeframe, bars.filter(inRange)]))
        : undefined,
    };
  }

  private snapshotHigherTimeframes(higherTimeframes: Record<string, OHLCVBar[]>, at: Date): Record<string, OHLCVBar | null> {
    return Object.fromEntries(
      Object.entries(higherTimeframes).map(([timeframe, bars]) => [
        timeframe,
        [...bars].reverse().find((bar) => bar.timestamp <= at) ?? null,
      ]),
    );
  }

  private latestTick(ticks: TickData[], at: Date): TickData | undefined {
    return [...ticks].reverse().find((tick) => tick.timestamp <= at);
  }

  private sortBars(bars: OHLCVBar[]): OHLCVBar[] {
    return [...bars].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private sortTicks(ticks: TickData[]): TickData[] {
    return [...ticks].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}
