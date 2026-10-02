import { CheckCircle2, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { UpcomingPayments } from "@/components/debts/upcoming-payments";
import { EmptyState } from "@/components/finance/empty-state";
import { Money } from "@/components/finance/money";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatLocalDate, todayIn } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { listRecentDebtPayments, listUpcomingPayments } from "@/lib/services/debts";

export const metadata: Metadata = { title: "Платежи" };

export default async function PaymentsPage() {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const [upcoming, recent, accountList] = await Promise.all([
    listUpcomingPayments(user.id, { untilDays: 60 }),
    listRecentDebtPayments(user.id, 30),
    listAccounts(user.id),
  ]);
  const accounts = accountList.map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }));
  const overdue = upcoming.filter((i) => i.displayStatus === "OVERDUE");
  const next = upcoming.filter((i) => i.displayStatus !== "OVERDUE");

  return (
    <div className="grid gap-8">
      <PageHeader title="Платежи" description="Обязательные платежи по долгам по порядку сроков." />

      {overdue.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="overdue-heading">
          <h2 id="overdue-heading" className="text-sm font-medium text-danger">
            Просрочено · {overdue.length}
          </h2>
          <UpcomingPayments items={overdue} accounts={accounts} today={today} />
        </section>
      ) : null}

      <section className="grid gap-3" aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="text-sm font-medium text-muted-foreground">
          Ближайшие 60 дней
        </h2>
        {next.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={overdue.length ? "Других платежей в ближайшее время нет" : "В ближайшие 60 дней платежей нет"}
            description={
              <>
                Платежи появляются здесь из графиков ваших <Link href="/debts" className="text-primary hover:underline">долгов</Link>.
              </>
            }
          />
        ) : (
          <UpcomingPayments items={next} accounts={accounts} today={today} />
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-sm font-medium text-muted-foreground">
          Последние платежи
        </h2>
        {recent.length === 0 ? (
          <EmptyState icon={Receipt} title="Платежей пока нет" />
        ) : (
          <Card className="divide-y">
            {recent.map((p) => (
              <Link key={p.id} href={`/debts/${p.debt.id}?tab=payments`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="truncate text-sm font-medium">{p.debt.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {formatLocalDate(p.paymentDate)} · {p.account.name}
                    {p.installmentNumber ? ` · №${p.installmentNumber}` : ""}
                  </p>
                </div>
                <div className="grid justify-items-end gap-1">
                  <Money amount={p.actualAccountDebit} currency={p.debt.currency} className={p.isReversed ? "font-medium line-through" : "font-medium"} />
                  {p.isReversed ? <Badge>Отменён</Badge> : p.isEarlyRepayment ? <Badge tone="primary">Досрочно</Badge> : null}
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
