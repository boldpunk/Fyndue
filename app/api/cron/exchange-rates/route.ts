import { env } from "@/lib/env";
import { refreshCentralBankRates } from "@/lib/services/central-bank-rates";
import { secretMatches } from "@/lib/telegram/server";

/**
 * Downloads today's Central Bank of Uzbekistan rates (docker compose
 * `scheduler`, every 15 minutes). A no-op once today's rate is stored.
 */
async function handle(request: Request) {
  if (!env.CRON_SECRET) return new Response(null, { status: 404 });
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(presented, env.CRON_SECRET)) return new Response(null, { status: 401 });
  const result = await refreshCentralBankRates();
  return Response.json({ ok: !result.error, ...result });
}

export const GET = handle;
export const POST = handle;
