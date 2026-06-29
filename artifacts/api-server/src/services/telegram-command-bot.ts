import { logger } from "../lib/logger";
import { ScannerService } from "./scanner";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const POLL_TIMEOUT_SECONDS = 25;
const POLL_RETRY_MS = 5_000;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number | string;
    };
  };
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export class TelegramCommandBot {
  private static instance: TelegramCommandBot;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private offset: number | null = null;

  static getInstance(): TelegramCommandBot {
    if (!TelegramCommandBot.instance) {
      TelegramCommandBot.instance = new TelegramCommandBot();
    }
    return TelegramCommandBot.instance;
  }

  async start(): Promise<void> {
    if (this.running) return;

    if (!BOT_TOKEN || !CHAT_ID) {
      logger.warn("Telegram command bot not configured - skipping command polling");
      return;
    }

    this.running = true;
    await this.skipPendingUpdates();
    logger.info("Telegram command bot started");
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info("Telegram command bot stopped");
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;

    this.timer = setTimeout(() => {
      void this.pollOnce();
    }, delayMs);
  }

  private async skipPendingUpdates(): Promise<void> {
    try {
      const updates = await this.getUpdates({ timeout: 0, limit: 100 });
      const lastUpdate = updates.at(-1);
      if (lastUpdate) {
        this.offset = lastUpdate.update_id + 1;
      }
    } catch (err) {
      logger.warn({ err }, "Failed to skip pending Telegram updates");
    }
  }

  private async pollOnce(): Promise<void> {
    if (!this.running) return;

    try {
      const updates = await this.getUpdates({
        timeout: POLL_TIMEOUT_SECONDS,
        offset: this.offset ?? undefined,
      });

      for (const update of updates) {
        this.offset = update.update_id + 1;
        await this.handleUpdate(update);
      }

      this.schedule(0);
    } catch (err) {
      logger.error({ err }, "Telegram command polling failed");
      this.schedule(POLL_RETRY_MS);
    }
  }

  private async getUpdates(params: {
    timeout: number;
    offset?: number;
    limit?: number;
  }): Promise<TelegramUpdate[]> {
    const query = new URLSearchParams({
      timeout: String(params.timeout),
      allowed_updates: JSON.stringify(["message"]),
    });

    if (params.offset) query.set("offset", String(params.offset));
    if (params.limit) query.set("limit", String(params.limit));

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?${query}`);
    const body = await res.json() as TelegramApiResponse<TelegramUpdate[]>;

    if (!res.ok || !body.ok) {
      throw new Error(body.description ?? `Telegram getUpdates failed with ${res.status}`);
    }

    return body.result ?? [];
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    const text = message?.text?.trim();
    if (!message || !text) return;

    const chatId = String(message.chat.id);
    if (chatId !== CHAT_ID) {
      logger.warn({ chatId }, "Ignoring Telegram command from unauthorized chat");
      return;
    }

    const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
    if (command === "/status" || command === "/scanner") {
      await this.sendMessage(chatId, this.formatScannerStatus());
      return;
    }

    if (command === "/help" || command === "/start") {
      await this.sendMessage(chatId, "Commands:\n/status - scanner running status\n/scanner - scanner running status");
    }
  }

  private formatScannerStatus(): string {
    const status = ScannerService.getInstance().getStatus();
    const state = status.running ? "ON" : "OFF";
    const lastScan = status.lastScanAt ?? "not scanned yet";
    const nextScan = status.nextScanIn === null ? "not scheduled" : `${status.nextScanIn}s`;

    return [
      `<b>Scanner Status: ${state}</b>`,
      `Last scan: <code>${lastScan}</code>`,
      `Next scan: <code>${nextScan}</code>`,
    ].join("\n");
  }

  private async sendMessage(chatId: string, text: string): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "Telegram command reply failed");
    }
  }
}
