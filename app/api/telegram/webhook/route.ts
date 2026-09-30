import { env } from "@/lib/env";
import type { TelegramUpdate } from "@/lib/telegram/client";
import { handleUpdate } from "@/lib/telegram/commands";
import { getTelegramClient, secretMatches } from "@/lib/telegram/server";

/**
 * Telegram webhook (docs/telegram.md §6). Authenticated by the secret token
 * Telegram echoes in X-Telegram-Bot-Api-Secret-Token. Handled updates always
 * get 200, so Telegram does not redeliver them after a failure.
 */
export async function POST(request: Request) {
  const client = getTelegramClient();
  if (!client || !env.TELEGRAM_WEBHOOK_SECRET) return new Response(null, { status: 404 });
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response(null, { status: 401 });
  }
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    await handleUpdate(update, client);
  } catch (error) {
    console.error("[telegram-webhook]", error instanceof Error ? error.name : "UnknownError", `update ${update.update_id}`);
  }
  return Response.json({ ok: true });
}
