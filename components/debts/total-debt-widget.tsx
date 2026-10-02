import { Money } from "@/components/finance/money";
import { ProgressBar } from "@/components/finance/progress-bar";
import { Card } from "@/components/ui/card";
import { formatPercent, money } from "@/lib/finance/money";
import type { DebtTotalsDTO } from "@/lib/services/debts";

/** SPEC §10 — principal and future interest are always labelled separately. */
export function TotalDebtWidget({ totals }: { totals: DebtTotalsDTO[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {totals.map((t) => (
        <Card key={t.currency} className="grid gap-4 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">Общий долг · {t.currency}</p>
            <p className="text-sm text-muted-foreground">
              выплачено <span className="tabular font-medium text-foreground">{formatPercent(t.paidPercent)}</span> · осталось{" "}
              <span className="tabular">{formatPercent(t.remainingPercent)}</span>
            </p>
          </div>
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">Осталось выплатить</p>
            <Money amount={t.remainingPrincipal} currency={t.currency} className="text-2xl font-semibold tracking-tight" />
          </div>
          <ProgressBar percent={t.paidPercent} label={`Выплачено от общего долга в ${t.currency}`} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">Общая сумма долга</dt>
              <dd><Money amount={t.principalBasis} currency={t.currency} /></dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">Выплачено</dt>
              <dd><Money amount={t.paidPrincipal} currency={t.currency} tone="positive" /></dd>
            </div>
            {money(t.remainingInterestEstimate).gt(0) ? (
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Будущие проценты{t.hasEstimates ? " (оценка)" : ""}</dt>
                <dd><Money amount={t.remainingInterestEstimate} currency={t.currency} /></dd>
              </div>
            ) : null}
            <div className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">Ещё предстоит заплатить</dt>
              <dd><Money amount={t.plannedFutureTotal} currency={t.currency} /></dd>
            </div>
          </dl>
        </Card>
      ))}
    </div>
  );
}
