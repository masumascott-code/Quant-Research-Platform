import { logger } from "../lib/logger";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    logger.warn("Telegram not configured — skipping notification");
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "Telegram API error");
    }
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram message");
  }
}

function confidenceEmoji(c?: string): string {
  switch (c) {
    case "Extreme": return "🔥";
    case "Very High": return "⭐⭐";
    case "High": return "⭐";
    case "Medium": return "🔶";
    default: return "🔵";
  }
}

function setupEmoji(t?: string): string {
  switch (t) {
    case "Resistance Breakout": return "💥";
    case "Breakout Retest": return "🔁";
    case "EMA Pullback": return "📐";
    case "Support Bounce": return "🛡️";
    case "Volume Expansion": return "📊";
    case "Trend Continuation": return "🚀";
    default: return "📌";
  }
}

export const Telegram = {
  async scannerStarted() {
    await sendMessage(
      `🟢 <b>QUANTEDGE AI v2.0 — Scanner Active</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Scanning every <b>30 seconds</b>\n` +
      `Only A/A+ setups (Score ≥90)\n` +
      `8-Factor Scoring | Multi-Timeframe\n` +
      `Risk Manager: Active ✅`
    );
  },

  async scannerStopped() {
    await sendMessage(`🔴 <b>Scanner Stopped</b>\nMarket scanner has been stopped.`);
  },

  async signalCreated(signal: {
    symbol: string;
    direction: string;
    score: number;
    grade: string;
    confidence?: string;
    setupType?: string;
    entryPrice: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    rrRatio: number | null;
    reason: string;
    whyNow?: string;
    timeframeAlignment?: string;
  }) {
    const dir = signal.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT";
    const grade = signal.grade === "A+" ? "⭐ A+" : "✅ A";
    const conf = confidenceEmoji(signal.confidence);
    const setup = setupEmoji(signal.setupType);

    await sendMessage(
      `🎯 <b>SIGNAL DETECTED</b> ${grade} ${conf}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `${dir} <b>${signal.symbol}</b>\n` +
      `${setup} Setup: <b>${signal.setupType ?? "Unknown"}</b>\n` +
      `📊 Score: <b>${signal.score.toFixed(0)}/100</b> | Confidence: <b>${signal.confidence ?? "High"}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 Entry: <code>${signal.entryPrice.toFixed(6)}</code>\n` +
      `🛑 SL:    <code>${signal.stopLoss.toFixed(6)}</code>\n` +
      `🎯 TP1:   <code>${signal.tp1.toFixed(6)}</code>\n` +
      `🎯 TP2:   <code>${signal.tp2.toFixed(6)}</code>\n` +
      `🎯 TP3:   <code>${signal.tp3.toFixed(6)}</code>\n` +
      `⚖️ RR:    <b>${signal.rrRatio ? signal.rrRatio.toFixed(2) + ":1" : "N/A"}</b>\n` +
      (signal.timeframeAlignment ? `📈 MTF:   ${signal.timeframeAlignment}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 <i>${signal.whyNow ?? signal.reason}</i>`
    );
  },

  async tradeOpened(trade: {
    tradeId: string;
    symbol: string;
    direction: string;
    setupType?: string;
    confidence?: string;
    entryPrice: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    signalScore: number;
    reason: string;
    rrRatio?: number;
  }) {
    const dir = trade.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT";
    const conf = confidenceEmoji(trade.confidence);
    const setup = setupEmoji(trade.setupType);
    const riskPct = Math.abs((trade.entryPrice - trade.stopLoss) / trade.entryPrice * 100).toFixed(2);

    await sendMessage(
      `📂 <b>TRADE OPENED</b> [${trade.tradeId}] ${conf}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `${dir} <b>${trade.symbol}</b>\n` +
      `${setup} <b>${trade.setupType ?? "Setup"}</b> | Score: <b>${trade.signalScore.toFixed(0)}/100</b>\n` +
      `Confidence: <b>${trade.confidence ?? "High"}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 Entry: <code>${trade.entryPrice.toFixed(6)}</code>\n` +
      `🛑 SL:    <code>${trade.stopLoss.toFixed(6)}</code> (Risk: ${riskPct}%)\n` +
      `🎯 TP1:   <code>${trade.tp1.toFixed(6)}</code>\n` +
      `🎯 TP2:   <code>${trade.tp2.toFixed(6)}</code>\n` +
      `🎯 TP3:   <code>${trade.tp3.toFixed(6)}</code>\n` +
      (trade.rrRatio ? `⚖️ RR:    <b>${trade.rrRatio.toFixed(2)}:1</b>\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 <i>${trade.reason}</i>`
    );
  },

  async tp1Hit(tradeId: string, symbol: string, price: number) {
    await sendMessage(
      `✅ <b>TP1 HIT</b> [${tradeId}]\n` +
      `<b>${symbol}</b> reached TP1 at <code>${price.toFixed(6)}</code>\n` +
      `📌 SL moved to break-even. Trailing remaining position.`
    );
  },

  async tp2Hit(tradeId: string, symbol: string, price: number) {
    await sendMessage(
      `✅✅ <b>TP2 HIT</b> [${tradeId}]\n` +
      `<b>${symbol}</b> reached TP2 at <code>${price.toFixed(6)}</code>\n` +
      `📌 SL trailed to TP1. Riding to TP3.`
    );
  },

  async tp3Hit(tradeId: string, symbol: string, price: number) {
    await sendMessage(
      `🏆 <b>TP3 HIT — FULL TARGET!</b> [${tradeId}]\n` +
      `<b>${symbol}</b> reached TP3 at <code>${price.toFixed(6)}</code>\n` +
      `🎉 All targets achieved. Excellent trade!`
    );
  },

  async slHit(tradeId: string, symbol: string, price: number) {
    await sendMessage(
      `🛑 <b>STOP LOSS HIT</b> [${tradeId}]\n` +
      `<b>${symbol}</b> stopped out at <code>${price.toFixed(6)}</code>\n` +
      `🧠 Learning engine reviewing setup now.`
    );
  },

  async tradeClosed(trade: {
    tradeId: string;
    symbol: string;
    direction: string;
    setupType?: string;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
    result: string;
    exitReason: string;
    holdingDurationMinutes: number;
  }) {
    const emoji = trade.result === "WIN" ? "🏆" : trade.result === "LOSS" ? "💔" : "➖";
    const pnlStr = trade.pnl >= 0 ? `+${trade.pnl.toFixed(4)}` : trade.pnl.toFixed(4);
    const pnlPctStr = trade.pnlPercent >= 0 ? `+${trade.pnlPercent.toFixed(2)}%` : `${trade.pnlPercent.toFixed(2)}%`;
    const hours = Math.floor(trade.holdingDurationMinutes / 60);
    const mins = trade.holdingDurationMinutes % 60;
    const durStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    await sendMessage(
      `${emoji} <b>TRADE CLOSED — ${trade.result}</b> [${trade.tradeId}]\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `<b>${trade.symbol}</b> ${trade.direction} | ${trade.setupType ?? ""}\n` +
      `📥 Entry: <code>${trade.entryPrice.toFixed(6)}</code>\n` +
      `📤 Exit:  <code>${trade.exitPrice.toFixed(6)}</code>\n` +
      `💰 PnL:   <code>${pnlStr} USDT (${pnlPctStr})</code>\n` +
      `⏱️ Time:  ${durStr}\n` +
      `📌 Exit:  ${trade.exitReason}`
    );
  },

  async watchlistAdded(symbol: string, direction: string, score: number, setupType: string) {
    await sendMessage(
      `👁️ <b>WATCHLIST</b> — Near-Miss Signal\n` +
      `<b>${symbol}</b> ${direction} | Score: <b>${score}/100</b>\n` +
      `Setup: ${setupType}\n` +
      `<i>Monitoring — will alert if setup improves to ≥90</i>`
    );
  },

  async riskPause(reason: string, durationMinutes: number) {
    await sendMessage(
      `⚠️ <b>RISK MANAGER — Trading Paused</b>\n` +
      `Reason: ${reason}\n` +
      `Duration: ${durationMinutes} minutes\n` +
      `<i>No new trades will be opened during this period.</i>`
    );
  },

  async dailyReport(report: {
    date: string;
    totalTrades: number;
    wins: number;
    losses: number;
    pnl: number;
    winRate: number;
    summary: string;
  }) {
    const pnlStr = report.pnl >= 0 ? `+${report.pnl.toFixed(4)}` : report.pnl.toFixed(4);
    await sendMessage(
      `📊 <b>Daily Report — ${report.date}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Trades: ${report.totalTrades} | Wins: ${report.wins} | Losses: ${report.losses}\n` +
      `Win Rate: <b>${(report.winRate * 100).toFixed(1)}%</b>\n` +
      `Net PnL: <code>${pnlStr} USDT</code>\n\n` +
      `<i>${report.summary}</i>`
    );
  },

  async weeklyReport(report: {
    weekStart: string;
    weekEnd: string;
    totalTrades: number;
    wins: number;
    losses: number;
    pnl: number;
    winRate: number;
    summary: string;
  }) {
    const pnlStr = report.pnl >= 0 ? `+${report.pnl.toFixed(4)}` : report.pnl.toFixed(4);
    await sendMessage(
      `📅 <b>Weekly Report</b>\n${report.weekStart} → ${report.weekEnd}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Trades: ${report.totalTrades} | Wins: ${report.wins} | Losses: ${report.losses}\n` +
      `Win Rate: <b>${(report.winRate * 100).toFixed(1)}%</b>\n` +
      `Net PnL: <code>${pnlStr} USDT</code>\n\n` +
      `<i>${report.summary}</i>`
    );
  },

  async learningReport(insights: {
    totalReviews: number;
    bestSetups: string[];
    worstSetups: string[];
    improvementNotes: string[];
  }) {
    const best = insights.bestSetups.slice(0, 3).join(", ") || "None yet";
    const worst = insights.worstSetups.slice(0, 3).join(", ") || "None yet";
    const notes = insights.improvementNotes.slice(0, 2).join("\n• ") || "No notes yet";
    await sendMessage(
      `🧠 <b>AI Learning Report</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Reviews: ${insights.totalReviews}\n` +
      `Best setups: ${best}\n` +
      `Watch out: ${worst}\n\n` +
      `Notes:\n• ${notes}`
    );
  },
};
