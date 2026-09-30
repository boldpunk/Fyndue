import { ArrowDownLeft, ArrowUpRight, CircleAlert, Landmark, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MonthChange } from "@/components/dashboard/month-change";
import { ProjectedBalanceCard } from "@/components/dashboard/projected-balance-card";
import { SafeToSpendCard } from "@/components/dashboard/safe-to-spend-card";
import { TotalDebtWidget } from "@/components/debts/total-debt-widget";
import { UpcomingPayments } from "@/components/debts/upcoming-payments";
import { EmptyState } from "@/components/finance/empty-state";
import { FinancialMetricCard } from "@/components/finance/financial-metric-card";
import { Money } from "@/components/finance/money";
import { PageHeader } from "@/components/layout/page-header";
import { QuickAddButton } from "@/components/layout/quick-add";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatLocalDate, formatYearMonthLabel } from "@/lib/finance/dates";
import { money } from "@/lib/finance/money";
import { getDashboard, type ChangeDTO, type CurrencyDashboard } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "Overview" };

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Primary currency large, other currencies listed below — never summed. */
function PerCurrency({
  rows,
  pick,
  change,
  goodWhen,
}: {
  rows: CurrencyDashboard[];
  pick: (c: CurrencyDashboard) => string;
  change?: (c: CurrencyDashboard) => ChangeDTO;
  goodWhen?: "up" | "down";
}) {
  const [first, ...rest] = rows;
  if (!first) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      <Money amount={pick(first)} currency={first.currency} />
      {rest.map((c) => (
        <Money key={c.currency} amount={pick(c)} currency={c.currency} className="text-sm font-medium text-muted-foreground" />
      ))}
      {change && goodWhen ? (
        <span className="text-xs">
          <MonthChange change={change(first)} goodWhen={goodWhen} />
        </span>
      ) : null}
    </>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await getDashboard(user.id);
  const firstName = user.name.split(" ")[0] ?? user.name;
  const [primary, ...others] = d.currencies;
  const accounts = d.accounts.map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }));
  const nonZero = (pick: (c: CurrencyDashboard) => string) => (c: CurrencyDashboard) => c === primary || !money(pick(c)).isZero();

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`${greeting(user.timezone)}, ${firstName}`}
        description={`${formatLocalDate(d.today, "en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${formatYearMonthLabel(d.month)}`}
        actions={<QuickAddButton label="Quick add" className="hidden lg:inline-flex" />}
      />

      {d.overdue.count > 0 ? (
        <Link
          href="/payments"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger transition-colors hover:bg-danger-subtle/70"
        >
          <CircleAlert className="size-5 shrink-0" aria-hidden />
          <span className="flex-1 font-medium">
            {d.overdue.count} overdue payment{d.overdue.count === 1 ? "" : "s"} ·{" "}
            {d.overdue.totals.map((t, i) => (
              <span key={t.currency}>
                {i > 0 ? " + " : ""}
                <Money amount={t.amount} currency={t.currency} />
              </span>
            ))}
          </span>
          <span className="font-medium underline">Review</span>
        </Link>
      ) : null}

      {d.accountCount === 0 ? (
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
        <FinancialMetricCard label="Available balance" icon={Wallet} tone="primary" footer={`${d.accountCount} active account${d.accountCount === 1 ? "" : "s"}`}>
          <PerCurrency rows={d.currencies.filter(nonZero((c) => c.balance))} pick={(c) => c.balance} />
        </FinancialMetricCard>
        <FinancialMetricCard
          label="Income this month"
          icon={ArrowDownLeft}
          tone="success"
          footer={
            primary && !money(primary.expectedIncomeThisMonth).isZero() ? (
              <span>
                + <Money amount={primary.expectedIncomeThisMonth} currency={primary.currency} /> expected, not yet received
              </span>
            ) : (
              "Actual income received"
            )
          }
        >
          <PerCurrency rows={d.currencies.filter(nonZero((c) => c.income))} pick={(c) => c.income} change={(c) => c.incomeChange} goodWhen="up" />
        </FinancialMetricCard>
        <FinancialMetricCard label="Expenses this month" icon={ArrowUpRight} tone="danger" footer="Excludes transfers and debt payments">
          <PerCurrency rows={d.currencies.filter(nonZero((c) => c.expenses))} pick={(c) => c.expenses} change={(c) => c.expensesChange} goodWhen="down" />
        </FinancialMetricCard>
        <FinancialMetricCard
          label="Debt payments this month"
          icon={Landmark}
          footer={
            primary ? (
              primary.debtToIncome === null ? (
                <span>Share of income: N/A (no income yet)</span>
              ) : (
                <span>
                  <span className="tabular font-medium text-foreground">{primary.debtToIncome}%</span> of this month&apos;s income
                </span>
              )
            ) : null
          }
        >
          <PerCurrency rows={d.currencies.filter(nonZero((c) => c.debtPayments))} pick={(c) => c.debtPayments} change={(c) => c.debtPaymentsChange} goodWhen="down" />
        </FinancialMetricCard>
      </section>

      {primary ? (
        <section aria-label="Cash flow" className="grid gap-4 lg:grid-cols-2">
          <SafeToSpendCard primary={primary} others={others} />
          <ProjectedBalanceCard primary={primary} others={others} />
        </section>
      ) : null}

      <section aria-labelledby="upcoming-heading" className="grid gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="upcoming-heading" className="text-sm font-medium text-muted-foreground">
            Upcoming payments · next 30 days
          </h2>
          <Link href="/payments" className="text-sm font-medium text-primary hover:underline">
            All payments
          </Link>
        </div>
        {d.upcoming.length ? (
          <UpcomingPayments items={d.upcoming} accounts={accounts} today={d.today} />
        ) : (
          <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
            Nothing due in the next 30 days.{" "}
            <Link href="/debts/new" className="text-primary hover:underline">
              Add a debt
            </Link>{" "}
            to track its payments.
          </p>
        )}
      </section>

      {d.debtTotals.length ? (
        <section aria-labelledby="debt-heading" className="grid gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="debt-heading" className="text-sm font-medium text-muted-foreground">
              Debt
            </h2>
            <Link href="/debts" className="text-sm font-medium text-primary hover:underline">
              All debts
            </Link>
          </div>
          <TotalDebtWidget totals={d.debtTotals} />
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <Link href="/transactions" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="grid gap-0.5 pt-3">
            {d.recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet. Use Quick add to record one.</p>
            ) : (
              d.recent.map((t) => <TransactionRow key={t.id} transaction={t} />)
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
            {d.accounts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No accounts yet.</p>
            ) : (
              d.accounts.map((a) => (
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
