import { ArrowDownLeft, ArrowUpRight, Landmark, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CurrencyTotals } from "@/components/finance/currency-totals";
import { EmptyState } from "@/components/finance/empty-state";
import { FinancialMetricCard } from "@/components/finance/financial-metric-card";
import { Money } from "@/components/finance/money";
import { PageHeader } from "@/components/layout/page-header";
import { QuickAddButton } from "@/components/layout/quick-add";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatLocalDate, formatYearMonthLabel, todayIn, yearMonthOf } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { getMonthOverview } from "@/lib/services/dashboard";
import { recentTransactions } from "@/lib/services/transactions";

export const metadata: Metadata = { title: "Overview" };

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const month = yearMonthOf(today);
  const [overview, recent, accounts] = await Promise.all([
    getMonthOverview(user.id, month),
    recentTransactions(user.id, 6),
    listAccounts(user.id),
  ]);
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`${greeting(user.timezone)}, ${firstName}`}
        description={`${formatLocalDate(today, "en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${formatYearMonthLabel(month)}`}
        actions={<QuickAddButton label="Quick add" className="hidden lg:inline-flex" />}
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Add your first account"
          description="Accounts hold your real balances — a bank card, cash, savings. Everything else builds on them."
          action={
            <Button asChild>
              <Link href="/accounts/new">
                <Plus /> Add account
              </Link>
            </Button>
          }
        />
      ) : null}

      <section aria-label="This month" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinancialMetricCard label="Available balance" icon={Wallet} tone="primary" footer={`${overview.accountCount} active account${overview.accountCount === 1 ? "" : "s"}`}>
          <CurrencyTotals totals={overview.balances} primaryCurrency={user.baseCurrency} emptyLabel="No accounts yet" />
        </FinancialMetricCard>
        <FinancialMetricCard
          label="Income this month"
          icon={ArrowDownLeft}
          tone="success"
          footer={
            overview.expectedIncome.length > 0 ? (
              <span>
                + expected{" "}
                {overview.expectedIncome.map((e) => (
                  <Money key={e.currency} amount={e.amount} currency={e.currency} className="mr-1" />
                ))}
              </span>
            ) : (
              "Actual income received"
            )
          }
        >
          <CurrencyTotals totals={overview.income} primaryCurrency={user.baseCurrency} emptyLabel="0" />
        </FinancialMetricCard>
        <FinancialMetricCard label="Expenses this month" icon={ArrowUpRight} tone="danger" footer="Excludes transfers and debt payments">
          <CurrencyTotals totals={overview.expenses} primaryCurrency={user.baseCurrency} emptyLabel="0" />
        </FinancialMetricCard>
        <FinancialMetricCard label="Debt payments this month" icon={Landmark} footer={<Link href="/payments" className="hover:underline">Actual amounts debited, incl. card fees</Link>}>
          <CurrencyTotals totals={overview.debtPayments} primaryCurrency={user.baseCurrency} emptyLabel="0" />
        </FinancialMetricCard>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <Link href="/transactions" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="grid gap-0.5 pt-3">
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet. Use Quick add to record one.</p>
            ) : (
              recent.map((t) => <TransactionRow key={t.id} transaction={t} />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <Link href="/accounts" className="text-sm font-medium text-primary hover:underline">
              Manage
            </Link>
          </CardHeader>
          <CardContent className="grid gap-1 pt-3">
            {accounts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No accounts yet.</p>
            ) : (
              accounts.map((a) => (
                <Link key={a.id} href={`/accounts/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/70">
                  <span className="truncate text-sm">{a.name}</span>
                  <Money amount={a.currentBalance} currency={a.currency} tone={a.currentBalance.startsWith("-") ? "negative" : "neutral"} className="text-sm font-medium" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
