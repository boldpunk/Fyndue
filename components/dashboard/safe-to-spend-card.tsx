import { ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/finance/money";
import { Card } from "@/components/ui/card";
import { formatLocalDate } from "@/lib/finance/dates";
import type { CurrencyDashboard } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils/cn";

/** SPEC §13 — informational only, never financial advice. */
export function SafeToSpendCard({ primary, others }: { primary: CurrencyDashboard; others: CurrencyDashboard[] }) {
  const s = primary.safeToSpend;
  const until = formatLocalDate(s.horizonDate, undefined, { day: "numeric", month: "short" });
  return (
    <Card className="grid content-start gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Можно потратить</h2>
        <span className={cn("grid size-8 place-items-center rounded-lg", s.isShort ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success")}>
          {s.isShort ? <TriangleAlert className="size-4" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
        </span>
      </div>
      <div className="grid gap-1">
        <Money amount={s.amount} currency={primary.currency} tone={s.isShort ? "negative" : "neutral"} className="text-3xl font-semibold tracking-tight" />
        <p className="text-sm text-muted-foreground">
          {s.isShort ? "Столько не хватает на обязательные платежи " : "Останется после обязательных платежей "}
          {s.basis === "NEXT_INCOME" ? `до следующего ожидаемого дохода (${until})` : `до конца месяца (${until})`}.
        </p>
      </div>
      <dl className="grid gap-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Доступно сейчас</dt>
          <dd><Money amount={primary.balance} currency={primary.currency} /></dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            Обязательные платежи{" "}
            <Link href="/payments" className="text-primary hover:underline">
              ({s.obligationCount})
            </Link>
          </dt>
          <dd><Money amount={`-${s.obligationsTotal}`} currency={primary.currency} /></dd>
        </div>
        {s.nextIncome ? (
          <div className="flex justify-between gap-3 text-muted-foreground">
            <dt>Следующий доход · {formatLocalDate(s.nextIncome.date, undefined, { day: "numeric", month: "short" })}</dt>
            <dd><Money amount={s.nextIncome.amount} currency={primary.currency} tone="muted" /></dd>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Добавьте ожидаемый доход (Доход → «Ожидается, ещё не получен»), чтобы планировать до следующей зарплаты.
          </p>
        )}
      </dl>
      {others.length ? (
        <ul className="grid gap-1 border-t pt-3 text-sm">
          {others.map((c) => (
            <li key={c.currency} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{c.currency}</span>
              <Money amount={c.safeToSpend.amount} currency={c.currency} tone={c.safeToSpend.isShort ? "negative" : "neutral"} />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">Оценка по вашим балансам и графикам платежей, а не финансовый совет.</p>
    </Card>
  );
}
