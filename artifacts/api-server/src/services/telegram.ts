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
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "Telegram API error");
    }
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram message");
  }
}

export const Telegram = {
  async scannerStarted() {
    await sendMessage(`🟢 <b>Scanner Started</b>\nBinance Futures Paper Trading Scanner is now active.\nScanning every 60 seconds for A/A+ setups.`);
  },

  async scannerStopped() {
    await sendMessage(`🔴 <b>Scanner Stopped</b>\nMarket scanner has been stopped.`);
  },

  async gainersUpdated(gainers: { symbol: string; priceChangePercent: number; rvol: number }[]) {
    if (gainers.length === 0) return;
    const top5 = gainers.slice(0, 5);
    const lines = top5.map((g, i) => `${i + 1}. <b>${g.symbol}</b> +${g.priceChangePercent.toFixed(2)}% | RVOL: ${g.rvol.toFixed(2)}x`);
    await sendMessage(`📈 <b>Top Gainers Updated</b>\n${lines.join("\n")}`);
  },

  async losersUpdated(losers: { symbol: string; priceChangePercent: number; rvol: number }[]) {
    if (losers.length === 0) return;
    const top5 = losers.slice(0, 5);
    const lines = top5.map((g, i) => `${i + 1}. <b>${g.symbol}</b> ${g.priceChangePercent.toFixed(2)}% | RVOL: ${g.rvol.toFixed(2)}x`);
    await sendMessage(`📉 <b>Top Losers Updated</b>\n${lines.join("\n")}`);
  },

  async signalCreated(signal: {
    symbol: string;
    direction: string;
    score: number;
    grade: string;
    entryPrice: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    rrRatio: number | null;
    reason: string;
  }) {
    const dir = signal.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT";
    const grade = signal.grade === "A+" ? "⭐ A+" : "✅ A";
    await sendMessage(
      `🎯 <b>Signal Generated</b> ${grade}\n` +
      `${dir} <b>${signal.symbol}</b>\n` +
      `Score: <b>${signal.score.toFixed(1)}/100</b>\n\n` +
      `Entry: <code>${signal.entryPrice}</code>\n` +
      `SL: <code>${signal.stopLoss}</code>\n` +
      `TP1: <code>${signal.tp1}</code>\n` +
      `TP2: <code>${signal.tp2}</code>\n` +
      `TP3: <code>${signal.tp3}</code>\n` +
      `RR: ${signal.rrRatio ? signal.rrRatio.toFixed(2) + ":1" : "N/A"}\n\n` +
      `<i>Why: ${signal.reason}</i>`
    );
  },

  async tradeOpened(trade: {
    tradeId: string;
    symbol: string;
    direction: string;
    entryPrice: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    signalScore: number;
    reason: string;
  }) {
    const dir = trade.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT";
    await sendMessage(
      `📂 <b>Trade Opened</b> [${trade.tradeId}]\n` +
      `${dir} <b>${trade.symbol}</b>\n` +
      `Score: <b>${trade.signalScore.toFixed(1)}</b>\n\n` +
      `Entry: <code>${trade.entryPrice}</code>\n` +
      `SL: <code>${trade.stopLoss}</code>\n` +
      `TP1: <code>${trade.tp1}</code> | TP2: <code>${trade.tp2}</code> | TP3: <code>${trade.tp3}</code>\n\n` +
      `<i>Reason: ${trade.reason}</i>`
    );
  },

  async tp1Hit(tradeId: string, symbol: string, price: number) {
    await sendMessage(`✅ <b>TP1 Hit</b> [${tradeId}]\n<b>${symbol}</b> reached TP1 at <code>${price}</code>\nSL moved to break-even. Trailing remaining position.`);
  },

  async tp2Hit(tradeId: string, symbol: string, price: number) {
    await sendMessage(`✅✅ <b>TP2 Hit</b> [${tradeId}]\n<b>${symbol}</b> reached TP2 at <code>${price}</code>\nContinuing to trail to TP3.`);
  },

  async tp3Hit(tradeId: string, symbol: string, price: number) {
    await sendMessage(`✅✅✅ <b>TP3 Hit!</b> [${tradeId}]\n<b>${symbol}</b> reached full target TP3 at <code>${price}</code>\n🎉 Full trade target achieved!`);
  },

  async slHit(tradeId: string, symbol: string, price: number) {
    await sendMessage(`🛑 <b>SL Hit</b> [${tradeId}]\n<b>${symbol}</b> stopped out at <code>${price}</code>\nReviewing setup for learning.`);
  },

  async tradeClosed(trade: {
    tradeId: string;
    symbol: string;
    direction: string;
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
    const hours = Math.floor(trade.holdingDurationMinutes / 60);
    const mins = trade.holdingDurationMinutes % 60;
    await sendMessage(
      `${emoji} <b>Trade Closed</b> [${trade.tradeId}] — ${trade.result}\n` +
      `<b>${trade.symbol}</b> ${trade.direction}\n` +
      `Entry: <code>${trade.entryPrice}</code> → Exit: <code>${trade.exitPrice}</code>\n` +
      `PnL: <code>${pnlStr} USDT (${trade.pnlPercent.toFixed(2)}%)</code>\n` +
      `Duration: ${hours > 0 ? `${hours}h ` : ""}${mins}m\n` +
      `Exit: ${trade.exitReason}`
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
      `📊 <b>Daily Report — ${report.date}</b>\n\n` +
      `Trades: ${report.totalTrades} | Wins: ${report.wins} | Losses: ${report.losses}\n` +
      `Win Rate: ${(report.winRate * 100).toFixed(1)}%\n` +
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
      `📅 <b>Weekly Report</b>\n${report.weekStart} → ${report.weekEnd}\n\n` +
      `Trades: ${report.totalTrades} | Wins: ${report.wins} | Losses: ${report.losses}\n` +
      `Win Rate: ${(report.winRate * 100).toFixed(1)}%\n` +
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
      `🧠 <b>Learning Report</b>\n\n` +
      `Reviews analyzed: ${insights.totalReviews}\n` +
      `Best setups: ${best}\n` +
      `Avoid: ${worst}\n\n` +
      `Improvement notes:\n• ${notes}`
    );
  },
};
