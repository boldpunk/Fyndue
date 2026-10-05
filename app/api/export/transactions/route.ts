import { getCurrentUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/finance/dates";
import { transactionsToCsv } from "@/lib/export/transactions-csv";
import { getPlan } from "@/lib/services/billing";
import { exportTransactions } from "@/lib/services/transactions";
import { transactionFiltersSchema } from "@/lib/validations/transactions";

/**
 * The operations list as CSV for Excel, with the same filters as /transactions
 * (month, type, account, category, search). Only the signed-in user's rows.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  // Pro feature: Free accounts land on the plans page instead of a file.
  if ((await getPlan(user.id)).tier !== "pro") return Response.redirect(new URL("/pro?feature=export", request.url), 303);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = transactionFiltersSchema.omit({ page: true }).parse(params);
  const rows = await exportTransactions(user.id, filters);
  const name = `fyndue-operacii-${filters.month ?? todayIn(user.timezone)}.csv`;
  return new Response(transactionsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
