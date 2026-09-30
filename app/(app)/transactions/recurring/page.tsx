import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/finance/money";
import { PageHeader } from "@/components/layout/page-header";
import { RecurringList } from "@/components/planning/recurring-list";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import { listRecurring, recurringMonthlyTotals } from "@/lib/services/recurring";

export const metadata: Metadata = { title: "Recurring" };

export default async function RecurringPage() {
  const user = await requireUser();
  const [items, accounts, categories] = await Promise.all([
    listRecurring(user.id),
    listAccounts(user.id),
    listCategories(user.id, { includeSystem: false }),
  ]);
  const totals = recurringMonthlyTotals(items);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <Link href="/transactions" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Transactions
      </Link>
      <PageHeader title="Recurring" description="Bills, subscriptions and income that repeat. They're plans until you record them." />
      {totals.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {totals.map((t) => (
            <Card key={t.currency} className="grid gap-2 p-4 text-sm">
              <p className="text-xs text-muted-foreground">Average per month · {t.currency}</p>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Recurring expenses</span>
                <Money amount={t.expenses} currency={t.currency} className="font-medium" />
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Recurring income</span>
                <Money amount={t.income} currency={t.currency} className="font-medium" tone="positive" />
              </div>
            </Card>
          ))}
        </div>
      ) : null}
      <RecurringList
        items={items}
        accounts={accounts.map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }))}
        categories={categories.map(({ id, name, type, icon, color }) => ({ id, name, type, icon, color }))}
        today={todayIn(user.timezone)}
      />
    </div>
  );
}
