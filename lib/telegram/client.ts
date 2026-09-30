/**
 * Thin Telegram Bot API wrapper. Errors never include the bot token (it is
 * part of the request URL), so they are safe to store in failureReason.
 */

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seconds to wait before retrying, from a 429 response. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "TelegramApiError";
  }

  /** The user blocked the bot or deleted the chat: stop sending. */
  get isBlocked(): boolean {
    return this.status === 403;
  }
}

export type SendResult = { messageId: string };

/** What the dispatcher and commands need; tests inject a fake. */
export type TelegramSender = {
  sendMessage(chatId: string, html: string): Promise<SendResult>;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; is_bot?: boolean };
  };
};

type ApiResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };

const API_BASE = "https://api.telegram.org";

export function createTelegramClient(token: string, fetchImpl: typeof fetch = fetch) {
  async function call<T>(method: string, body: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${API_BASE}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "network error";
      throw new TelegramApiError(`Telegram ${method}: ${reason}`, 0);
    }
    const data = (await response.json().catch(() => ({ ok: false }))) as ApiResponse<T>;
    if (!response.ok || !data.ok || data.result === undefined) {
      const status = data.error_code ?? response.status;
      const description = (data.description ?? response.statusText ?? "request failed").slice(0, 200);
      throw new TelegramApiError(`Telegram ${method} ${status}: ${description}`, status, data.parameters?.retry_after);
    }
    return data.result;
  }

  return {
    async sendMessage(chatId: string, html: string): Promise<SendResult> {
      const result = await call<{ message_id: number }>("sendMessage", {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      return { messageId: String(result.message_id) };
    },
    getUpdates(offset: number | undefined, timeoutSeconds = 25) {
      return call<TelegramUpdate[]>("getUpdates", { offset, timeout: timeoutSeconds, allowed_updates: ["message"] }, (timeoutSeconds + 10) * 1000);
    },
    setWebhook(url: string, secretToken: string) {
      return call<boolean>("setWebhook", { url, secret_token: secretToken, allowed_updates: ["message"] });
    },
    deleteWebhook() {
      return call<boolean>("deleteWebhook", {});
    },
    getMe() {
      return call<{ id: number; username: string }>("getMe", {});
    },
    setMyCommands(commands: { command: string; description: string }[]) {
      return call<boolean>("setMyCommands", { commands });
    },
  };
}

export type TelegramClient = ReturnType<typeof createTelegramClient>;
