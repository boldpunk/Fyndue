import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { Money } from "@/components/finance/money";
import { ProgressBar } from "@/components/finance/progress-bar";
import { PageHeader } from "@/components/layout/page-header";
import { CurrencySwitch, MonthNav } from "@/components/planning/month-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { CURRENCIES } from "@/lib/constants/finance";
import {
  formatLocalDate,
  parseYearMonth,
  RANGE_PRESETS,
  resolveRange,
  todayIn,
  yearMonthOf,
  type RangePreset,
} from "@/lib/finance/dates";
import { getAnalytics, getMonthlySummary } from "@/lib/services/analytics";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Analytics" };

const PRESET_LABELS: Record<RangePreset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "3m": "3 months",
  "6m": "6 months",
  year: "Year",
  custom: "Custom",
};

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "debts", label: "Debt" },
  { value: "summary", label: "Monthly summary" },
] as const;

function Tile({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <Card className="grid content-start gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="min-w-0 text-base font-semibold tracking-tight sm:text-lg">{children}</div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

const monthLabel = (key: string) => formatLocalDate(`${key}-01`, "en-US", { month: "short" });
const monthFull = (key: string) => formatLocalDate(`${key}-01`, "en-US", { month: "long", year: "numeric" });

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; currency?: string; tab?: string; month?: string }>;
}) {
  const user = await requireUser();
  const q = await searchParams;
  const today = todayIn(user.timezone);
  const preset: RangePreset = RANGE_PRESETS.find((p) => p === q.range) ?? "this-month";
  const range = resolveRange(preset, today, { from: q.from, to: q.to });
  const currency = CURRENCIES.find((c) => c === q.currency);
  const tab = TABS.find((t) => t.value === q.tab)?.value ?? "overview";

  const data = await getAnalytics(user.id, { ...range, currency });
  const cur = data.currency;
  const summaryMonth = parseYearMonth(q.month) ?? yearMonthOf(today);
  const summary = tab === "summary" ? await getMonthlySummary(user.id, summaryMonth, cur) : null;

  const current: Record<string, string | undefined> = {
    range: preset === "this-month" ? undefined : preset,
    from: preset === "custom" ? range.from : undefined,
    to: preset === "custom" ? range.to : undefined,
    currency: cur === user.baseCurrency ? undefined : cur,
    tab: tab === "overview" ? undefined : tab,
  };
  const params = (over: Record<string, string | undefined>) => {
    const merged = { ...current, ...over };
    const qs = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1])));
    return `/analytics${qs.size ? `?${qs}` : ""}`;
  };

  const single = data.monthly.length === 1;
  const categories = data.monthly.map((m) => ({ key: m.key, label: monthLabel(m.key), fullLabel: monthFull(m.key) }));

  return (
    <div className="grid gap-6">
      <PageHeader title="Analytics" description={`${formatLocalDate(range.from)} – ${formatLocalDate(range.to)} · ${cur}`} />

      {/* One filter row above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Date range" className="flex flex-wrap gap-1 rounded-md border bg-card p-0.5">
          {RANGE_PRESETS.filter((p) => p !== "custom").map((p) => (
            <Link
              key={p}
              href={params({ range: p === "this-month" ? undefined : p, from: undefined, to: undefined })}
              aria-current={preset === p ? "true" : undefined}
              className={cn("rounded px-2.5 py-1 text-xs font-medium", preset === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {PRESET_LABELS[p]}
            </Link>
          ))}
        </nav>
        <form action="/analytics" className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="range" value="custom" />
          {cur !== user.baseCurrency ? <input type="hidden" name="currency" value={cur} /> : null}
          {tab !== "overview" ? <input type="hidden" name="tab" value={tab} /> : null}
          <Input type="date" name="from" defaultValue={range.from} aria-label="From" className="h-8 w-auto px-2 text-xs md:text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" name="to" defaultValue={range.to} aria-label="To" className="h-8 w-auto px-2 text-xs md:text-xs" />
          <Button type="submit" size="sm" variant={preset === "custom" ? "default" : "outline"}>
            Apply
          </Button>
        </form>
        <CurrencySwitch current={cur} currencies={data.currencies} basePath="/analytics" params={{ ...current, currency: undefined }} />
      </div>

      <nav aria-label="Analytics sections" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={params({ tab: t.value === "overview" ? undefined : t.value })}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === t.value ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <>
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Income">
              <Money amount={data.totals.income} currency={cur} />
            </Tile>
            <Tile label="Expenses" hint="Excludes transfers and debt payments">
              <Money amount={data.totals.expenses} currency={cur} />
            </Tile>
            <Tile label="Debt payments" hint="Actual debits incl. card fees">
              <Money amount={data.totals.debtPayments} currency={cur} />
            </Tile>
            <Tile label="Net cash flow">
              <Money amount={data.totals.net} currency={cur} tone="auto" signed />
            </Tile>
            <Tile label="Debt-to-income" hint="Informational only">
              {data.totals.debtToIncome === null ? <span className="text-muted-foreground">N/A</span> : <span>{data.totals.debtToIncome}%</span>}
            </Tile>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-5">
              {single && data.daily ? (
                <ColumnChart
                  title="Daily spending"
                  description="Expenses per day"
                  categories={data.daily.map((d) => ({ key: d.key, label: String(Number(d.key.slice(8))), fullLabel: formatLocalDate(d.key, "en-US", { weekday: "short", day: "numeric", month: "short" }) }))}
                  series={[{ key: "expenses", label: "Expenses", color: "var(--viz-2)", values: data.daily.map((d) => d.expenses) }]}
                  currency={cur}
                />
              ) : (
                <ColumnChart
                  title="Income vs expenses"
                  description="Per month, with debt payments shown separately"
                  categories={categories}
                  series={[
                    { key: "income", label: "Income", color: "var(--viz-1)", values: data.monthly.map((m) => m.income) },
                    { key: "expenses", label: "Expenses", color: "var(--viz-2)", values: data.monthly.map((m) => m.expenses) },
                    { key: "debt", label: "Debt payments", color: "var(--viz-3)", values: data.monthly.map((m) => m.debtPayments) },
                  ]}
                  currency={cur}
                />
              )}
            </Card>
            <Card className="p-5">
              <BarList
                title="Expenses by category"
                description={`${data.byCategory.length} categor${data.byCategory.length === 1 ? "y" : "ies"} · share of spending`}
                rows={data.byCategoryTop.map((c) => ({ key: c.id ?? c.name, label: c.name, icon: c.icon, color: c.color, amount: c.amount, share: c.share }))}
                currency={cur}
              />
            </Card>
          </div>

          <Card className="p-5">
            <ColumnChart
              title="Net cash flow"
              description="Income − expenses − debt payments, per month"
              categories={categories}
              series={[{ key: "net", label: "Net cash flow", color: "var(--viz-pos)", values: data.monthly.map((m) => m.net) }]}
              signedColors={{ positive: "var(--viz-pos)", negative: "var(--viz-neg)" }}
              currency={cur}
              height={180}
            />
          </Card>
        </>
      ) : null}

      {tab === "debts" ? (
        <>
          <section aria-label="Debt totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Original principal">
              <Money amount={data.debt.principalBasis} currency={cur} />
            </Tile>
            <Tile label="Principal paid">
              <Money amount={data.debt.principalPaid} currency={cur} />
            </Tile>
            <Tile label="Principal remaining">
              <Money amount={data.debt.principalRemaining} currency={cur} />
            </Tile>
            <Tile label="Interest remaining (estimate)">
              <Money amount={data.debt.interestRemainingEstimate} currency={cur} />
            </Tile>
            <Tile label="Interest paid">
              <Money amount={data.debt.interestPaid} currency={cur} />
            </Tile>
            <Tile label="Fees paid" hint="Origination, card/transfer and other fees">
              <Money amount={data.debt.feesPaid} currency={cur} />
            </Tile>
            <Tile label="Penalties paid">
              <Money amount={data.debt.penaltiesPaid} currency={cur} />
            </Tile>
            <Tile label="Total cost above principal" hint="Interest + fees + penalties">
              <Money amount={data.debt.costAbovePrincipal} currency={cur} />
            </Tile>
          </section>
          <p className="-mt-2 text-xs text-muted-foreground">
            Totals are all-time for {cur} debts (paid off included, archived excluded). Total cash outflow — what actually left your accounts:{" "}
            <Money amount={data.debt.cashOutflow} currency={cur} className="font-medium text-foreground" />.
          </p>

          <Card className="p-5">
            <ColumnChart
              title="Monthly debt payments"
              description="What your payments went to, in the selected range"
              mode="stacked"
              categories={categories}
              series={[
                { key: "principal", label: "Principal", color: "var(--viz-1)", values: data.debt.monthlyPayments.map((m) => m.principal) },
                { key: "interest", label: "Interest", color: "var(--viz-2)", values: data.debt.monthlyPayments.map((m) => m.interest) },
                { key: "fees", label: "Fees & penalties", color: "var(--viz-3)", values: data.debt.monthlyPayments.map((m) => m.fees) },
              ]}
              currency={cur}
            />
          </Card>

          <Card className="divide-y">
            {data.debt.debts.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No {cur} debts.</p>
            ) : (
              data.debt.debts.map((d) => (
                <Link key={d.id} href={`/debts/${d.id}?tab=analytics`} className="grid gap-2 p-4 hover:bg-muted/50">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-muted-foreground">
                      <Money amount={d.currentPrincipal} currency={cur} className="font-medium text-foreground" /> left ·{" "}
                      {d.status === "PAID_OFF" ? "paid off" : d.projectedPayoffDate ? `payoff ${formatLocalDate(d.projectedPayoffDate, "en-US", { month: "short", year: "numeric" })}` : "no schedule"}
                    </span>
                  </div>
                  <ProgressBar percent={d.paidPercent} label={`${d.name} repaid`} tone={d.status === "PAID_OFF" ? "success" : "primary"} />
                  <span className="text-xs text-muted-foreground">
                    <span className="tabular font-medium text-foreground">{d.paidPercent}%</span> repaid
                  </span>
                </Link>
              ))
            )}
          </Card>
        </>
      ) : null}

      {tab === "summary" && summary ? (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Recomputed from your transactions every time, so past months stay reproducible.
              {summary.isCurrentMonth ? " This month is still in progress." : ""}
            </p>
            <MonthNav
              month={summaryMonth}
              basePath="/analytics"
              params={{ tab: "summary", currency: cur === user.baseCurrency ? undefined : cur }}
            />
          </div>
          <Card>
            <dl className="divide-y">
              {(
                [
                  ["Income", <Money key="i" amount={summary.income} currency={cur} />],
                  ["Expenses", <Money key="e" amount={summary.expenses} currency={cur} />],
                  ["Debt payments", <Money key="d" amount={summary.debtPayments} currency={cur} />],
                  ["Net cash flow", <Money key="n" amount={summary.netCashFlow} currency={cur} tone="auto" signed />],
                  ["Debt reduction (principal repaid)", <Money key="r" amount={summary.debtReduction} currency={cur} />],
                  [
                    "Largest expense category",
                    summary.largestExpenseCategory ? (
                      <span key="c">
                        {summary.largestExpenseCategory.name} · <Money amount={summary.largestExpenseCategory.amount} currency={cur} />
                      </span>
                    ) : (
                      "—"
                    ),
                  ],
                  ["Total remaining debt", <Money key="t" amount={summary.totalRemainingDebt} currency={cur} />],
                  [summary.isCurrentMonth ? "Balance so far" : "Ending balance", <Money key="b" amount={summary.endingBalance} currency={cur} />],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
