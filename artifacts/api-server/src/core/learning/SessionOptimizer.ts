import type { LearningDataset, SessionFinding, SessionOptimization } from "./types";

export class SessionOptimizer {
  optimize(dataset: LearningDataset): SessionOptimization {
    const buckets = new Map<string, { trades: number; wins: number; pnl: number }>();

    for (const trade of dataset.trades.filter((item) => item.status === "closed")) {
      const session = sessionFromDate(trade.openedAt);
      const bucket = buckets.get(session) ?? { trades: 0, wins: 0, pnl: 0 };
      bucket.trades += 1;
      bucket.wins += trade.result === "WIN" ? 1 : 0;
      bucket.pnl += trade.pnl;
      buckets.set(session, bucket);
    }

    for (const session of dataset.marketContexts.map((context) => context.session)) {
      if (!buckets.has(session)) buckets.set(session, { trades: 0, wins: 0, pnl: 0 });
    }

    const sessions = [...buckets.entries()].map(([session, bucket]): SessionFinding => ({
      session,
      trades: bucket.trades,
      winRate: bucket.trades > 0 ? round(bucket.wins / bucket.trades) : 0,
      pnl: round(bucket.pnl),
    })).sort((a, b) => b.pnl - a.pnl || b.winRate - a.winRate);

    const eligible = sessions.filter((session) => session.trades >= 2);

    return {
      bestSession: eligible[0],
      worstSession: eligible.at(-1),
      sessions,
    };
  }
}

function sessionFromDate(value?: Date | null): string {
  if (!value) return "UNKNOWN";
  const hour = value.getUTCHours();
  if (hour >= 0 && hour < 8) return "ASIA";
  if (hour >= 8 && hour < 13) return "LONDON";
  if (hour >= 13 && hour < 21) return "NEW_YORK";
  return "LATE_US";
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
