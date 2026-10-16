import { env } from "@/lib/env";
import { DomainError } from "@/lib/errors";
import { importBankNotices, importReply } from "@/lib/services/bank-import";
import { userIdForIngestToken } from "@/lib/services/ingest-link";
import { prisma } from "@/lib/db";
import { getTelegramClient } from "@/lib/telegram/server";

const MAX_BYTES = 10_000;

/**
 * Bank notices from a phone automation (docs/telegram.md §10). The secret
 * token in the path is the only credential; the body is the notice text
 * (text/plain, JSON {"text": …} or a form field "text").
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const userId = await userIdForIngestToken((await params).token);
  if (!userId) return new Response("Ссылка недействительна", { status: 404 });

  const raw = await request.text();
  if (raw.length > MAX_BYTES) return new Response("Слишком длинный текст", { status: 413 });
  let text = raw;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      text = String((JSON.parse(raw) as { text?: unknown }).text ?? "");
    } catch {
      return new Response("Неверный JSON", { status: 400 });
    }
  } else if (type.includes("application/x-www-form-urlencoded")) {
    text = new URLSearchParams(raw).get("text") ?? "";
  }

  try {
    const results = await importBankNotices(userId, text);
    if (results.length === 0) return new Response("Не похоже на уведомление банка — ничего не записано", { status: 422 });
    // The same confirmation as in the bot, so the user sees what was recorded.
    const client = getTelegramClient();
    const connection = client ? await prisma.telegramConnection.findUnique({ where: { userId } }) : null;
    if (client && connection?.status === "CONNECTED" && connection.telegramChatId) {
      await client.sendMessage(connection.telegramChatId, importReply(results, env.BETTER_AUTH_URL)).catch(() => undefined);
    }
    return Response.json({ ok: true, results: results.map((r) => ({ status: r.status, amount: r.notice.amount, place: r.notice.place })) });
  } catch (error) {
    if (error instanceof DomainError) return new Response(error.message, { status: 422 });
    throw error;
  }
}
