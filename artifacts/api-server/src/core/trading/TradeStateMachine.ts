export type TradeState =
  | "PENDING"
  | "OPEN"
  | "TP1_HIT"
  | "TP2_HIT"
  | "TP3_HIT"
  | "TRAILING"
  | "BREAKEVEN"
  | "CLOSED_WIN"
  | "CLOSED_LOSS"
  | "CANCELLED"
  | "REJECTED";

export type TradeTransition =
  | "TradeOpened"
  | "TradeUpdated"
  | "TP1Hit"
  | "TP2Hit"
  | "TP3Hit"
  | "StopMoved"
  | "TradeClosed"
  | "TradeCancelled"
  | "TradeRejected";

const TERMINAL_STATES: ReadonlySet<TradeState> = new Set([
  "CLOSED_WIN",
  "CLOSED_LOSS",
  "CANCELLED",
  "REJECTED",
]);

const TRANSITIONS: Record<TradeTransition, Partial<Record<TradeState, TradeState[]>>> = {
  TradeOpened: {
    PENDING: ["OPEN"],
  },
  TradeUpdated: {
    OPEN: ["OPEN"],
    TP1_HIT: ["TP1_HIT"],
    TP2_HIT: ["TP2_HIT"],
    TP3_HIT: ["TP3_HIT"],
    BREAKEVEN: ["BREAKEVEN"],
    TRAILING: ["TRAILING"],
  },
  TP1Hit: {
    OPEN: ["TP1_HIT"],
    TP2_HIT: ["TP2_HIT"],
    TRAILING: ["TRAILING"],
  },
  TP2Hit: {
    OPEN: ["TP2_HIT"],
    TP1_HIT: ["TP2_HIT"],
    BREAKEVEN: ["TP2_HIT"],
  },
  TP3Hit: {
    OPEN: ["TP3_HIT"],
    TP1_HIT: ["TP3_HIT"],
    TP2_HIT: ["TP3_HIT"],
    BREAKEVEN: ["TP3_HIT"],
    TRAILING: ["TP3_HIT"],
  },
  StopMoved: {
    TP1_HIT: ["BREAKEVEN"],
    TP2_HIT: ["TRAILING"],
    OPEN: ["BREAKEVEN", "TRAILING"],
  },
  TradeClosed: {
    OPEN: ["CLOSED_WIN", "CLOSED_LOSS", "BREAKEVEN"],
    TP1_HIT: ["CLOSED_WIN", "CLOSED_LOSS", "BREAKEVEN"],
    TP2_HIT: ["CLOSED_WIN", "CLOSED_LOSS", "BREAKEVEN"],
    TP3_HIT: ["CLOSED_WIN"],
    BREAKEVEN: ["CLOSED_WIN", "CLOSED_LOSS", "BREAKEVEN"],
    TRAILING: ["CLOSED_WIN", "CLOSED_LOSS", "BREAKEVEN"],
  },
  TradeCancelled: {
    PENDING: ["CANCELLED"],
    OPEN: ["CANCELLED"],
  },
  TradeRejected: {
    PENDING: ["REJECTED"],
  },
};

export class TradeStateMachine {
  transition(from: TradeState, event: TradeTransition, requestedTo?: TradeState): TradeState {
    if (TERMINAL_STATES.has(from)) {
      throw new Error(`Cannot transition terminal trade state ${from}`);
    }

    const allowed = TRANSITIONS[event][from] ?? [];
    if (allowed.length === 0) {
      throw new Error(`Invalid trade transition ${event} from ${from}`);
    }

    const next = requestedTo ?? allowed[0];
    if (!allowed.includes(next)) {
      throw new Error(`Invalid trade transition ${event} from ${from} to ${next}`);
    }

    return next;
  }

  derive(trade: {
    status: string;
    result: string | null;
    tp1Hit: boolean;
    tp2Hit: boolean;
    tp3Hit: boolean;
    currentSl: string | null;
    entryPrice: string;
  }): TradeState {
    if (trade.status === "closed") {
      if (trade.result === "WIN") return "CLOSED_WIN";
      if (trade.result === "LOSS") return "CLOSED_LOSS";
      return "BREAKEVEN";
    }

    if (trade.tp3Hit) return "TP3_HIT";
    if (trade.tp2Hit) return "TRAILING";
    if (trade.tp1Hit) return "BREAKEVEN";
    return "OPEN";
  }
}
