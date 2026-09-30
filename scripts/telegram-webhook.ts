/**
 * Points the Telegram bot at this deployment's webhook:
 *
 *   docker compose run --rm web tsx --conditions=react-server scripts/telegram-webhook.ts
 *
 * Uses BETTER_AUTH_URL (the public https:// address) and
 * TELEGRAM_WEBHOOK_SECRET, and registers the bot's command menu.
 * Run it again after changing the domain or the secret. Local installs use
 * `pnpm telegram:dev` instead, which removes the webhook.
 */
import "dotenv/config";

async function main() {
  const { env, telegramEnabled } = await import("@/lib/env");
  if (!telegramEnabled || !env.TELEGRAM_BOT_TOKEN) throw new Error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME first.");
  if (!env.TELEGRAM_WEBHOOK_SECRET) throw new Error("Set TELEGRAM_WEBHOOK_SECRET first (openssl rand -hex 32).");
  const url = new URL("/api/telegram/webhook", env.BETTER_AUTH_URL);
  if (url.protocol !== "https:") throw new Error(`Telegram needs an https:// address, got ${url.origin}.`);

  const { createTelegramClient } = await import("@/lib/telegram/client");
  const { BOT_COMMANDS } = await import("@/lib/telegram/commands");
  const client = createTelegramClient(env.TELEGRAM_BOT_TOKEN);
  const me = await client.getMe();
  await client.setWebhook(url.toString(), env.TELEGRAM_WEBHOOK_SECRET);
  await client.setMyCommands(BOT_COMMANDS);
  console.log(`@${me.username} now delivers messages to ${url}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
