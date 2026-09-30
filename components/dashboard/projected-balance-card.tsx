import { TrendingUp } from "lucide-react";
import { Money } from "@/components/finance/money";
import { Card } from "@/components/ui/card";
import { formatLocalDate } from "@/lib/finance/dates";
import { money } from "@/lib/finance/money";
import type { CurrencyDashboard } from "@/lib/services/dashboard";

/** SPEC §14 — a projection, never a guaranteed balance. */
export function ProjectedBalanceCard({ primary, others }: { primary: CurrencyDashboard; others: CurrencyDashboard[] }) {
  const p = primary.projected;
  const cur = primary.currency;
  return (
    <Card className="grid content-start gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Projected balance · {formatLocalDate(p.until, "en-US", { day: "numeric", month: "short" })}</h2>
        <span className="grid size-8 place-items-center rounded-lg bg-info-subtle text-info">
          <TrendingUp className="size-4" aria-hidden />
        </span>
      </div>
      <Money amount={p.projected} currency={cur} tone={p.projected.startsWith("-") ? "negative" : "neutral"} className="text-3xl font-semibold tracking-tight" />
      <dl className="grid gap-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Current balance</dt>
          <dd><Money amount={p.balance} currency={cur} /></dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">+ Expected income</dt>
          <dd><Money amount={p.expectedIncome} currency={cur} /></dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">− Planned expenses</dt>
          <dd>
            {money(p.plannedExpenses).isZero() ? <span className="text-muted-foreground">— none planned</span> : <Money amount={p.plannedExpenses} currency={cur} />}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">− Scheduled debt payments</dt>
          <dd><Money amount={p.debtPayments} currency={cur} /></dd>
        </div>
      </dl>
      {others.length ? (
        <ul className="grid gap-1 border-t pt-3 text-sm">
          {others.map((c) => (
            <li key={c.currency} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{c.currency}</span>
              <Money amount={c.projected.projected} currency={c.currency} />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Projected, not guaranteed. Recurring expenses will be included once they arrive (Phase 4).
      </p>
    </Card>
  );
}
