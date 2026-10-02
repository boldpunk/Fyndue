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
import { formatLocalDate, formatYearMonthLabel, parseYearMonth, RANGE_PRESETS, type RangePreset, resolveRange, todayIn, yearMonthOf } from "@/lib/finance/dates";
import { getAnalytics, getMonthlySummary } from "@/lib/services/analytics";
import { cn } from "@/lib/utils/cn";
import { formatPercent } from "@/lib/finance/money";
import { pluralRu } from "@/lib/finance/recurrence";

export const metadata: Metadata = { title: "Аналитика" };

const PRESET_LABELS: Record<RangePreset, string> = {
  "this-month": "Этот месяц",
  "last-month": "Прошлый месяц",
  "3m": "3 месяца",
  "6m": "6 месяцев",
  year: "Год",
  custom: "Свой период",
};

const TABS = [
  { value: "overview", label: "Обзор" },
  { value: "debts", label: "Долги" },
  { value: "summary", label: "Итоги месяца" },
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

const monthLabel = (key: string) => formatLocalDate(`${key}-01`, undefined, { month: "short" });
const monthFull = (key: string) => formatYearMonthLabel(parseYearMonth(key)!);

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
      <PageHeader title="Аналитика" description={`${formatLocalDate(range.from)} – ${formatLocalDate(range.to)} · ${cur}`} />

      {/* One filter row above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Период" className="flex flex-wrap gap-1 rounded-md border bg-card p-0.5">
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
          <Input type="date" name="from" defaultValue={range.from} aria-label="С" className="h-8 w-auto px-2 text-xs md:text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" name="to" defaultValue={range.to} aria-label="По" className="h-8 w-auto px-2 text-xs md:text-xs" />
          <Button type="submit" size="sm" variant={preset === "custom" ? "default" : "outline"}>
            Применить
          </Button>
        </form>
        <CurrencySwitch current={cur} currencies={data.currencies} basePath="/analytics" params={{ ...current, currency: undefined }} />
      </div>

      <nav aria-label="Разделы аналитики" className="flex gap-1 border-b">
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
          <section aria-label="Итоги" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Доходы">
              <Money amount={data.totals.income} currency={cur} />
            </Tile>
            <Tile label="Расходы" hint="Без переводов и платежей по долгам">
              <Money amount={data.totals.expenses} currency={cur} />
            </Tile>
            <Tile label="Платежи по долгам" hint="Фактические списания, включая комиссии">
              <Money amount={data.totals.debtPayments} currency={cur} />
            </Tile>
            <Tile label="Чистый денежный поток">
              <Money amount={data.totals.net} currency={cur} tone="auto" signed />
            </Tile>
            <Tile label="Долговая нагрузка" hint="Только для информации">
              {data.totals.debtToIncome === null ? <span className="text-muted-foreground">—</span> : <span>{formatPercent(data.totals.debtToIncome)}</span>}
            </Tile>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-5">
              {single && data.daily ? (
                <ColumnChart
                  title="Расходы по дням"
                  description="Сколько потрачено за день"
                  categories={data.daily.map((d) => ({ key: d.key, label: String(Number(d.key.slice(8))), fullLabel: formatLocalDate(d.key, undefined, { weekday: "short", day: "numeric", month: "short" }) }))}
                  series={[{ key: "expenses", label: "Расходы", color: "var(--viz-2)", values: data.daily.map((d) => d.expenses) }]}
                  currency={cur}
                />
              ) : (
                <ColumnChart
                  title="Доходы и расходы"
                  description="По месяцам, платежи по долгам — отдельно"
                  categories={categories}
                  series={[
                    { key: "income", label: "Доходы", color: "var(--viz-1)", values: data.monthly.map((m) => m.income) },
                    { key: "expenses", label: "Расходы", color: "var(--viz-2)", values: data.monthly.map((m) => m.expenses) },
                    { key: "debt", label: "Платежи по долгам", color: "var(--viz-3)", values: data.monthly.map((m) => m.debtPayments) },
                  ]}
                  currency={cur}
                />
              )}
            </Card>
            <Card className="p-5">
              <BarList
                title="Расходы по категориям"
                description={`${data.byCategory.length} ${pluralRu(data.byCategory.length, ["категория", "категории", "категорий"])} · доля в расходах`}
                rows={data.byCategoryTop.map((c) => ({ key: c.id ?? c.name, label: c.name, icon: c.icon, color: c.color, amount: c.amount, share: c.share }))}
                currency={cur}
              />
            </Card>
          </div>

          <Card className="p-5">
            <ColumnChart
              title="Чистый денежный поток"
              description="Доходы − расходы − платежи по долгам, по месяцам"
              categories={categories}
              series={[{ key: "net", label: "Чистый денежный поток", color: "var(--viz-pos)", values: data.monthly.map((m) => m.net) }]}
              signedColors={{ positive: "var(--viz-pos)", negative: "var(--viz-neg)" }}
              currency={cur}
              height={180}
            />
          </Card>
        </>
      ) : null}

      {tab === "debts" ? (
        <>
          <section aria-label="Итоги по долгам" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Сумма долгов">
              <Money amount={data.debt.principalBasis} currency={cur} />
            </Tile>
            <Tile label="Выплачено">
              <Money amount={data.debt.principalPaid} currency={cur} />
            </Tile>
            <Tile label="Осталось выплатить">
              <Money amount={data.debt.principalRemaining} currency={cur} />
            </Tile>
            <Tile label="Осталось процентов (оценка)">
              <Money amount={data.debt.interestRemainingEstimate} currency={cur} />
            </Tile>
            <Tile label="Уплачено процентов">
              <Money amount={data.debt.interestPaid} currency={cur} />
            </Tile>
            <Tile label="Уплачено комиссий" hint="За выдачу, за переводы и прочие">
              <Money amount={data.debt.feesPaid} currency={cur} />
            </Tile>
            <Tile label="Уплачено штрафов">
              <Money amount={data.debt.penaltiesPaid} currency={cur} />
            </Tile>
            <Tile label="Переплата сверх суммы долга" hint="Проценты + комиссии + штрафы">
              <Money amount={data.debt.costAbovePrincipal} currency={cur} />
            </Tile>
          </section>
          <p className="-mt-2 text-xs text-muted-foreground">
            Итоги за всё время по долгам в {cur} (погашенные включены, архивные — нет). Всего ушло денег со счетов:{" "}
            <Money amount={data.debt.cashOutflow} currency={cur} className="font-medium text-foreground" />.
          </p>

          <Card className="p-5">
            <ColumnChart
              title="Платежи по долгам по месяцам"
              description="На что пошли платежи за выбранный период"
              mode="stacked"
              categories={categories}
              series={[
                { key: "principal", label: "Основной долг", color: "var(--viz-1)", values: data.debt.monthlyPayments.map((m) => m.principal) },
                { key: "interest", label: "Проценты", color: "var(--viz-2)", values: data.debt.monthlyPayments.map((m) => m.interest) },
                { key: "fees", label: "Комиссии и штрафы", color: "var(--viz-3)", values: data.debt.monthlyPayments.map((m) => m.fees) },
              ]}
              currency={cur}
            />
          </Card>

          <Card className="divide-y">
            {data.debt.debts.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Долгов в {cur} нет.</p>
            ) : (
              data.debt.debts.map((d) => (
                <Link key={d.id} href={`/debts/${d.id}?tab=analytics`} className="grid gap-2 p-4 hover:bg-muted/50">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-muted-foreground">
                      <Money amount={d.currentPrincipal} currency={cur} className="font-medium text-foreground" /> осталось ·{" "}
                      {d.status === "PAID_OFF" ? "погашен" : d.projectedPayoffDate ? `погашение в ${formatYearMonthLabel(yearMonthOf(d.projectedPayoffDate)).toLowerCase()}` : "без графика"}
                    </span>
                  </div>
                  <ProgressBar percent={d.paidPercent} label={`${d.name}: выплачено`} tone={d.status === "PAID_OFF" ? "success" : "primary"} />
                  <span className="text-xs text-muted-foreground">
                    выплачено <span className="tabular font-medium text-foreground">{formatPercent(d.paidPercent)}</span>
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
              Пересчитывается из ваших операций каждый раз, поэтому итоги прошлых месяцев всегда воспроизводимы.
              {summary.isCurrentMonth ? " Этот месяц ещё не закончился." : ""}
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
                  ["Доходы", <Money key="i" amount={summary.income} currency={cur} />],
                  ["Расходы", <Money key="e" amount={summary.expenses} currency={cur} />],
                  ["Платежи по долгам", <Money key="d" amount={summary.debtPayments} currency={cur} />],
                  ["Чистый денежный поток", <Money key="n" amount={summary.netCashFlow} currency={cur} tone="auto" signed />],
                  ["Долг уменьшился (выплачено основного долга)", <Money key="r" amount={summary.debtReduction} currency={cur} />],
                  [
                    "Самая крупная категория расходов",
                    summary.largestExpenseCategory ? (
                      <span key="c">
                        {summary.largestExpenseCategory.name} · <Money amount={summary.largestExpenseCategory.amount} currency={cur} />
                      </span>
                    ) : (
                      "—"
                    ),
                  ],
                  ["Всего осталось по долгам", <Money key="t" amount={summary.totalRemainingDebt} currency={cur} />],
                  [summary.isCurrentMonth ? "Баланс на сегодня" : "Баланс на конец месяца", <Money key="b" amount={summary.endingBalance} currency={cur} />],
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
