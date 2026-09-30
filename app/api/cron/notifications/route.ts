import { env } from "@/lib/env";
import { runReminders } from "@/lib/services/notifications";
import { getTelegramClient, secretMatches } from "@/lib/telegram/server";

/**
 * Reminder run for a scheduler (Vercel Cron sends GET with
 * `Authorization: Bearer $CRON_SECRET`). Safe to call repeatedly or in
 * parallel: each reminder is claimed before it is sent.
 */
async function handle(request: Request) {
  if (!env.CRON_SECRET) return new Response(null, { status: 404 });
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(presented, env.CRON_SECRET)) return new Response(null, { status: 401 });
  const client = getTelegramClient();
  if (!client) return Response.json({ ok: false, error: "Telegram is not configured" }, { status: 503 });
  const summary = await runReminders({ sender: client });
  return Response.json({ ok: true, ...summary });
}

export const GET = handle;
export const POST = handle;
