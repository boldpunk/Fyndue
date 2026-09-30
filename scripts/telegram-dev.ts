/**
 * Local Telegram worker: `pnpm telegram:dev`
 *
 * Telegram cannot reach an app running on your PC, so instead of the
 * webhook this long-polls getUpdates and feeds each message to the same
 * command handler, and runs the reminder job every REMINDER_INTERVAL_MS.
 * Keep it running next to `pnpm dev`. On a public deployment use the webhook
 * and /api/cron/notifications instead.
 */
import "dotenv/config";

const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

async function main() {
  const { env, telegramEnabled } = await import("@/lib/env");
  if (!telegramEnabled || !env.TELEGRAM_BOT_TOKEN) {
    console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in .env first (see .env.example).");
    process.exit(1);
  }
  const { createTelegramClient, TelegramApiError } = await import("@/lib/telegram/client");
  const { BOT_COMMANDS, handleUpdate } = await import("@/lib/telegram/commands");
  const { runReminders } = await import("@/lib/services/notifications");

  const client = createTelegramClient(env.TELEGRAM_BOT_TOKEN);
  const me = await client.getMe();
  // Long polling and a webhook are mutually exclusive.
  await client.deleteWebhook();
  await client.setMyCommands(BOT_COMMANDS);
  console.log(`Telegram bot @${me.username} is polling. Press Ctrl+C to stop.`);

  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    console.log("\nStopping…");
    process.exit(0);
  });

  async function reminders() {
    try {
      const s = await runReminders({ sender: client });
      if (s.sent || s.failed || s.cancelled) {
        console.log(`[reminders] sent ${s.sent}, failed ${s.failed}, cancelled ${s.cancelled}, deferred (quiet hours) ${s.deferred}`);
      }
    } catch (error) {
      console.error("[reminders] run failed:", error instanceof Error ? error.message : error);
    }
  }
  await reminders();
  setInterval(reminders, REMINDER_INTERVAL_MS);

  let offset: number | undefined;
  while (!stopping) {
    try {
      const updates = await client.getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        const command = update.message?.text?.split(/\s+/)[0] ?? "(no text)";
        console.log(`[update] ${command}`);
        await handleUpdate(update, client).catch((error: unknown) =>
          console.error("[update] failed:", error instanceof Error ? error.message : error),
        );
      }
    } catch (error) {
      const wait = error instanceof TelegramApiError && error.retryAfter ? error.retryAfter * 1000 : 5000;
      console.error("[poll]", error instanceof Error ? error.message : error, `— retrying in ${wait / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
