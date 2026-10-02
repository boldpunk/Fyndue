import { ArrowDownLeft, ArrowUpRight, CalendarClock, CircleAlert, Landmark, ShieldCheck, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GettingStarted, type SetupStep } from "@/components/dashboard/getting-started";
import { KeyFigure } from "@/components/dashboard/key-figure";
import { MonthChange } from "@/components/dashboard/month-change";
import { ProjectedBalanceCard } from "@/components/dashboard/projected-balance-card";
import { SafeToSpendCard } from "@/components/dashboard/safe-to-spend-card";
import { TotalDebtWidget } from "@/components/debts/total-debt-widget";
import { UpcomingPayments } from "@/components/debts/upcoming-payments";
import { daysLabel } from "@/components/finance/payment-status-badge";
import { FinancialMetricCard } from "@/components/finance/financial-metric-card";
import { Money } from "@/components/finance/money";
import { ProgressBar } from "@/components/finance/progress-bar";
import { PageHeader } from "@/components/layout/page-header";
import { QuickAddButton } from "@/components/layout/quick-add";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatLocalDate, formatYearMonthLabel } from "@/lib/finance/dates";
import { formatPercent, money } from "@/lib/finance/money";
import { pluralRu } from "@/lib/finance/recurrence";
import { getDashboard, type ChangeDTO, type CurrencyDashboard } from "@/lib/services/dashboard";
import { getTelegramConnection } from "@/lib/services/telegram-connection";

export const metadata: Metadata = { title: "Обзор" };

function greeting(timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).format(new Date()),
  );
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

const shortDate = (date: string) => formatLocalDate(date, undefined, { day: "numeric", month: "long" });

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
  const [d, telegram] = await Promise.all([getDashboard(user.id), getTelegramConnection(user.id)]);
  const firstName = user.name.split(" ")[0] ?? user.name;
  const [primary, ...others] = d.currencies;
  const accounts = d.accounts.map(({ id, name, currency, currentBalance }) => ({
    id,
    name,
    currency,
    currentBalance,
  }));
  const nonZero = (pick: (c: CurrencyDashboard) => string) => (c: CurrencyDashboard) => c === primary || !money(pick(c)).isZero();
  const debt = d.debtTotals.find((t) => t.currency === d.primaryCurrency) ?? d.debtTotals[0];
  const next = d.upcoming[0];
  const safe = primary?.safeToSpend;

  const steps: SetupStep[] = [
    {
      key: "account",
      title: "Добавьте счёт",
      hint: "Карта, наличные, накопления",
      href: "/accounts/new",
      done: d.accountCount > 0,
    },
    {
      key: "debt",
      title: "Добавьте долг",
      hint: "Кредит, рассрочка или микрозайм",
      href: "/debts/new",
      done: d.debtTotals.length > 0,
    },
    {
      key: "transaction",
      title: "Запишите доход или расход",
      hint: "Зарплату, покупку, перевод",
      href: "/transactions/new",
      done: d.recent.length > 0,
    },
    {
      key: "telegram",
      title: "Подключите Telegram",
      hint: "Напоминания о платежах",
      href: "/settings/notifications",
      done: telegram.status === "CONNECTED",
    },
  ];

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`${greeting(user.timezone)}, ${firstName}`}
        description={formatLocalDate(d.today, undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        actions={<QuickAddButton label="Добавить операцию" className="hidden lg:inline-flex" />}
      />

      {d.overdue.count > 0 ? (
        <Link
          href="/payments"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger transition-colors hover:bg-danger-subtle/70"
        >
          <CircleAlert className="size-5 shrink-0" aria-hidden />
          <span className="flex-1 font-medium">
            Просрочено: {d.overdue.count} {pluralRu(d.overdue.count, ["платёж", "платежа", "платежей"])} на{" "}
            {d.overdue.totals.map((t, i) => (
              <span key={t.currency}>
                {i > 0 ? " + " : ""}
                <Money amount={t.amount} currency={t.currency} />
              </span>
            ))}
          </span>
          <span className="font-medium underline">Посмотреть</span>
        </Link>
      ) : null}

      <GettingStarted steps={steps} />

      {/* SPEC §2: the four questions the dashboard must answer at a glance. */}
      <section aria-label="Главное" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KeyFigure
          question="Сколько у меня денег"
          icon={Wallet}
          tone="primary"
          href="/accounts"
          footer={
            d.accountCount === 0 ? (
              "Добавьте первый счёт"
            ) : d.combinedBalance && others.length ? (
              <>
                ≈ <Money amount={d.combinedBalance.amount} currency={d.primaryCurrency} className="font-medium text-foreground" /> вместе по вашим курсам
              </>
            ) : (
              `На ${d.accountCount} ${pluralRu(d.accountCount, ["счёте", "счетах", "счетах"])}`
            )
          }
        >
          <div className="grid gap-0.5 text-2xl font-semibold tracking-tight">
            <PerCurrency rows={d.currencies.filter(nonZero((c) => c.balance))} pick={(c) => c.balance} />
          </div>
        </KeyFigure>

        <KeyFigure
          question="Сколько я должен"
          icon={Landmark}
          href={debt ? "/debts" : "/debts/new"}
          footer={
            debt ? (
              <>
                Выплачено {formatPercent(debt.paidPercent)} · <Money amount={debt.paidPrincipal} currency={debt.currency} />
              </>
            ) : (
              "Добавьте кредит или рассрочку"
            )
          }
        >
          {debt ? (
            <>
              <Money amount={debt.remainingPrincipal} currency={debt.currency} className="text-2xl font-semibold tracking-tight" />
              {d.debtTotals
                .filter((t) => t !== debt)
                .map((t) => (
                  <Money key={t.currency} amount={t.remainingPrincipal} currency={t.currency} className="text-sm font-medium text-muted-foreground" />
                ))}
              <ProgressBar percent={debt.paidPercent} label="Общий долг: выплачено" className="mt-1.5" />
            </>
          ) : (
            <span className="text-2xl font-semibold tracking-tight text-muted-foreground">Долгов нет</span>
          )}
        </KeyFigure>

        <KeyFigure
          question="Ближайший платёж"
          icon={CalendarClock}
          href={next ? "/payments" : "/debts/new"}
          tone={next && next.days < 0 ? "danger" : next && next.days <= 3 ? "warning" : "neutral"}
          footer={
            next
              ? `${next.debt.name} · ${shortDate(next.dueDate)}`
              : d.debtTotals.length
                ? "В ближайшие 30 дней платежей нет"
                : "Появится, когда вы добавите долг"
          }
        >
          {next ? (
            <>
              <Money amount={next.remainingTotal} currency={next.debt.currency} className="text-2xl font-semibold tracking-tight" />
              <span className={next.days < 0 ? "text-sm font-medium text-danger" : "text-sm font-medium"}>
                {next.days === 0 ? "Сегодня" : next.days === 1 ? "Завтра" : daysLabel(next.days).replace(/^./, (c) => c.toUpperCase())}
              </span>
            </>
          ) : (
            <span className="text-2xl font-semibold tracking-tight text-muted-foreground">—</span>
          )}
        </KeyFigure>

        <KeyFigure
          question="Сколько можно потратить"
          icon={safe?.isShort ? TriangleAlert : ShieldCheck}
          tone={safe?.isShort ? "danger" : "success"}
          href="/payments"
          footer={
            safe
              ? safe.isShort
                ? "Не хватает на обязательные платежи"
                : safe.basis === "NEXT_INCOME"
                  ? `После обязательных платежей до дохода ${shortDate(safe.horizonDate)}`
                  : `После обязательных платежей до конца месяца`
              : "Появится, когда добавите счёт"
          }
        >
          {safe && primary ? (
            <Money
              amount={safe.amount}
              currency={primary.currency}
              tone={safe.isShort ? "negative" : "neutral"}
              className="text-2xl font-semibold tracking-tight"
            />
          ) : (
            <span className="text-2xl font-semibold tracking-tight text-muted-foreground">—</span>
          )}
        </KeyFigure>
      </section>

      <section aria-labelledby="month-heading" className="grid gap-3">
        <h2 id="month-heading" className="text-sm font-medium text-muted-foreground">
          {formatYearMonthLabel(d.month)}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FinancialMetricCard
            label="Доходы"
            icon={ArrowDownLeft}
            tone="success"
            footer={
              primary && !money(primary.expectedIncomeThisMonth).isZero() ? (
                <span>
                  + <Money amount={primary.expectedIncomeThisMonth} currency={primary.currency} /> ещё ожидается
                </span>
              ) : (
                "Фактически получено"
              )
            }
          >
            <PerCurrency rows={d.currencies.filter(nonZero((c) => c.income))} pick={(c) => c.income} change={(c) => c.incomeChange} goodWhen="up" />
          </FinancialMetricCard>
          <FinancialMetricCard label="Расходы" icon={ArrowUpRight} tone="danger" footer="Без переводов и платежей по долгам">
            <PerCurrency rows={d.currencies.filter(nonZero((c) => c.expenses))} pick={(c) => c.expenses} change={(c) => c.expensesChange} goodWhen="down" />
          </FinancialMetricCard>
          <FinancialMetricCard
            label="Платежи по долгам"
            icon={Landmark}
            footer={
              primary ? (
                primary.debtToIncome === null ? (
                  <span>Доля от дохода появится, когда запишете доход</span>
                ) : (
                  <span>
                    <span className="tabular font-medium text-foreground">{formatPercent(primary.debtToIncome)}</span> от дохода за месяц
                  </span>
                )
              ) : null
            }
          >
            <PerCurrency
              rows={d.currencies.filter(nonZero((c) => c.debtPayments))}
              pick={(c) => c.debtPayments}
              change={(c) => c.debtPaymentsChange}
              goodWhen="down"
            />
          </FinancialMetricCard>
          <FinancialMetricCard label="Будет на конец месяца" icon={TrendingUp} footer="Прогноз, а не гарантия">
            <PerCurrency rows={d.currencies.filter(nonZero((c) => c.projected.projected))} pick={(c) => c.projected.projected} />
          </FinancialMetricCard>
        </div>
      </section>

      <section aria-labelledby="upcoming-heading" className="grid gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="upcoming-heading" className="text-sm font-medium text-muted-foreground">
            Платежи на ближайшие 30 дней
          </h2>
          <Link href="/payments" className="text-sm font-medium text-primary hover:underline">
            Все платежи
          </Link>
        </div>
        {d.upcoming.length ? (
          <UpcomingPayments items={d.upcoming} accounts={accounts} today={d.today} />
        ) : (
          <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
            В ближайшие 30 дней платежей нет.{" "}
            <Link href="/debts/new" className="text-primary hover:underline">
              Добавьте долг
            </Link>
            , чтобы Fyndue следил за его платежами.
          </p>
        )}
      </section>

      {primary ? (
        <section aria-labelledby="cash-heading" className="grid gap-3">
          <h2 id="cash-heading" className="text-sm font-medium text-muted-foreground">
            Как считаются эти суммы
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <SafeToSpendCard primary={primary} others={others} />
            <ProjectedBalanceCard primary={primary} others={others} />
          </div>
        </section>
      ) : null}

      {d.debtTotals.length ? (
        <section aria-labelledby="debt-heading" className="grid gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="debt-heading" className="text-sm font-medium text-muted-foreground">
              Долги
            </h2>
            <Link href="/debts" className="text-sm font-medium text-primary hover:underline">
              Все долги
            </Link>
          </div>
          <TotalDebtWidget totals={d.debtTotals} />
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Последние операции</CardTitle>
            <Link href="/transactions" className="text-sm font-medium text-primary hover:underline">
              Все
            </Link>
          </CardHeader>
          <CardContent className="grid gap-0.5 pt-3">
            {d.recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Операций пока нет. Нажмите «Добавить операцию», чтобы записать первую.</p>
            ) : (
              d.recent.map((t) => <TransactionRow key={t.id} transaction={t} />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Счета</CardTitle>
            <Link href="/accounts" className="text-sm font-medium text-primary hover:underline">
              Управлять
            </Link>
          </CardHeader>
          <CardContent className="grid gap-1 pt-3">
            {d.accounts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Счетов пока нет.{" "}
                <Link href="/accounts/new" className="text-primary hover:underline">
                  Добавить
                </Link>
              </p>
            ) : (
              d.accounts.map((a) => (
                <Link key={a.id} href={`/accounts/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/70">
                  <span className="truncate text-sm">{a.name}</span>
                  <Money
                    amount={a.currentBalance}
                    currency={a.currency}
                    tone={a.currentBalance.startsWith("-") ? "negative" : "neutral"}
                    className="text-sm font-medium"
                  />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
