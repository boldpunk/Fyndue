import { ArrowLeft, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DebtIcon } from "@/components/debts/debt-card";
import { DebtActions } from "@/components/debts/debt-actions";
import { DebtDocuments } from "@/components/debts/debt-documents";
import { DebtSettings } from "@/components/debts/debt-settings";
import { PaymentHistory } from "@/components/debts/payment-history";
import { ScheduleEditor } from "@/components/debts/schedule-editor";
import { ScheduleView } from "@/components/debts/schedule-view";
import { EmptyState } from "@/components/finance/empty-state";
import { Money } from "@/components/finance/money";
import { PaymentStatusBadge, daysLabel } from "@/components/finance/payment-status-badge";
import { ProgressBar } from "@/components/finance/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { DAY_COUNT_LABELS, DEBT_TYPE_LABELS, FEE_MODE_LABELS, REPAYMENT_TYPE_LABELS, SCHEDULE_REASON_LABELS } from "@/lib/constants/debts";
import { NotFoundError } from "@/lib/errors";
import { formatLocalDate, formatYearMonthLabel, parseYearMonth, todayIn } from "@/lib/finance/dates";
import { groupByMonth } from "@/lib/finance/debt-cost";
import { formatPercent, money, toMoneyString } from "@/lib/finance/money";
import { ColumnChart } from "@/components/charts/column-chart";
import { listAccounts } from "@/lib/services/accounts";
import { getDebtDetail, getScheduleSnapshot, type DebtDetailDTO } from "@/lib/services/debts";
import { listDebtDocuments } from "@/lib/services/documents";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Долг" };

const TABS = [
  { value: "overview", label: "Обзор" },
  { value: "schedule", label: "График" },
  { value: "payments", label: "Платежи" },
  { value: "analytics", label: "Аналитика" },
  { value: "documents", label: "Документы" },
  { value: "settings", label: "Настройки" },
] as const;
type Tab = (typeof TABS)[number]["value"];

function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

function Overview({ debt }: { debt: DebtDetailDTO }) {
  const cur = debt.currency;
  const m = (v: string | null) => (v === null ? "—" : <Money amount={v} currency={cur} />);
  const feeLabel = debt.knownTotalRepayment ? "Проценты и комиссии (без разбивки)" : "Комиссии";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="grid gap-4 p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Основной долг</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Сумма долга">{m(debt.originalPrincipal)}</Stat>
          {debt.principalBasis !== debt.originalPrincipal ? <Stat label="База долга (с комиссией в сумме)">{m(debt.principalBasis)}</Stat> : null}
          <Stat label="Выплачено">{m(debt.paidPrincipal)}</Stat>
          <Stat label="Осталось">{m(debt.currentPrincipal)}</Stat>
          <Stat label="Выплачено, %">{formatPercent(debt.paidPercent)}</Stat>
          <Stat label="Осталось, %">{formatPercent(debt.remainingPercent)}</Stat>
          {money(debt.paidBeforeTracking).gt(0) ? <Stat label="Выплачено до Fyndue">{m(debt.paidBeforeTracking)}</Stat> : null}
          <Stat label="Выплачено через Fyndue">{m(debt.cost.principalPaid)}</Stat>
        </dl>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Что впереди</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Платежей сделано">{debt.paymentsCompleted}</Stat>
          <Stat label="Платежей осталось">{debt.paymentsRemaining}</Stat>
          <Stat label="Следующий платёж">
            {debt.nextPayment ? (
              <>
                <Money amount={debt.nextPayment.amountDue} currency={cur} /> · {formatLocalDate(debt.nextPayment.dueDate)}
              </>
            ) : (
              "—"
            )}
          </Stat>
          <Stat label="До следующего платежа">{debt.nextPayment ? daysLabel(debt.nextPayment.daysUntil) : "—"}</Stat>
          <Stat label="Прогноз даты погашения">{debt.projectedPayoffDate ? formatLocalDate(debt.projectedPayoffDate) : "—"}</Stat>
          <Stat label="Осталось выплатить">{m(debt.currentPrincipal)}</Stat>
          <Stat label={debt.hasEstimates ? "Будущие проценты (оценка)" : "Будущие проценты"}>{m(debt.remainingInterestEstimate)}</Stat>
          <Stat label="Ещё предстоит заплатить" hint="Основной долг + проценты + комиссии по графику">
            {m(debt.plannedFutureTotal)}
          </Stat>
        </dl>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Во что этот долг уже обошёлся</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Уплачено процентов">{m(debt.cost.interestPaid)}</Stat>
          <Stat label="Комиссии за выдачу / обслуживание">{m(debt.cost.originationFeesPaid)}</Stat>
          <Stat label="Комиссии за переводы">{m(debt.cost.processingFeesPaid)}</Stat>
          <Stat label="Прочие комиссии">{m(debt.cost.otherFeesPaid)}</Stat>
          <Stat label="Штрафы">{m(debt.cost.penaltiesPaid)}</Stat>
          <Stat label="Переплата сверх суммы долга">{m(debt.cost.costAbovePrincipal)}</Stat>
          <Stat label="Всего ушло денег" hint="Сколько на самом деле списано со счетов">
            {m(debt.cost.cashOutflow)}
          </Stat>
        </dl>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Условия</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Схема погашения">{REPAYMENT_TYPE_LABELS[debt.repaymentType]}</Stat>
          <Stat label="Годовая ставка">{debt.annualInterestRate ? formatPercent(String(Number(debt.annualInterestRate))) : "0%"}</Stat>
          {debt.annualInterestRate ? <Stat label="Расчёт процентов">{DAY_COUNT_LABELS[debt.dayCountConvention]}</Stat> : null}
          <Stat label="Дата начала">{formatLocalDate(debt.startDate)}</Stat>
          {debt.firstPaymentDate ? <Stat label="Первый платёж в Fyndue">{formatLocalDate(debt.firstPaymentDate)}</Stat> : null}
          {debt.feeMode !== "NONE" ? <Stat label="Комиссия">{FEE_MODE_LABELS[debt.feeMode]}</Stat> : null}
          {debt.originationFeeAmount && money(debt.originationFeeAmount).gt(0) ? <Stat label="Размер комиссии">{m(debt.originationFeeAmount)}</Stat> : null}
          {debt.netAmountReceived && debt.netAmountReceived !== debt.originalPrincipal ? <Stat label="Получено на руки">{m(debt.netAmountReceived)}</Stat> : null}
          {debt.contractTotalRepayment ? <Stat label={debt.knownTotalRepayment ? "Всего вернуть (по данным кредитора)" : "К возврату по договору (без процентов)"}>{m(debt.contractTotalRepayment)}</Stat> : null}
          {debt.knownTotalRepayment ? <Stat label="О графике">{feeLabel} — в столбце комиссий</Stat> : null}
        </dl>
        {debt.notes ? <p className="text-sm whitespace-pre-line text-muted-foreground">{debt.notes}</p> : null}
      </Card>
    </div>
  );
}

function DebtAnalytics({ debt }: { debt: DebtDetailDTO }) {
  const cur = debt.currency;
  const paid = groupByMonth(
    debt.payments
      .filter((p) => !p.isReversed)
      .map((p) => ({
        date: p.paymentDate,
        principal: p.principal,
        interest: p.interest,
        fees: money(p.originationFee).plus(money(p.processingFee)).plus(money(p.penalty)).plus(money(p.otherFee)),
      })),
  );
  const ahead = groupByMonth(
    debt.schedule
      .filter((i) => i.isOpen)
      .map((i) => ({
        date: i.dueDate,
        principal: money(i.plannedPrincipal).minus(money(i.paidPrincipal)),
        interest: money(i.plannedInterest).minus(money(i.paidInterest)),
        fees: money(i.plannedFees).minus(money(i.paidFees)),
      })),
  ).slice(0, 24);
  const toSeries = (rows: typeof paid, feesLabel: string) => [
    { key: "principal", label: "Основной долг", color: "var(--viz-1)", values: rows.map((r) => toMoneyString(r.principal)) },
    { key: "interest", label: debt.hasEstimates ? "Проценты (оценка)" : "Проценты", color: "var(--viz-2)", values: rows.map((r) => toMoneyString(r.interest)) },
    { key: "fees", label: feesLabel, color: "var(--viz-3)", values: rows.map((r) => toMoneyString(r.fees)) },
  ];
  const cats = (rows: typeof paid) =>
    rows.map((r) => ({
      key: r.key,
      label: formatLocalDate(`${r.key}-01`, undefined, { month: "short" }),
      fullLabel: formatYearMonthLabel(parseYearMonth(r.key)!),
    }));
  return (
    <div className="grid gap-4">
      <Card className="p-5">
        {paid.length ? (
          <ColumnChart title="Сделанные платежи" description="Платежи по месяцам (без отменённых) и на что они пошли" mode="stacked" categories={cats(paid)} series={toSeries(paid, "Комиссии и штрафы")} currency={cur} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Платежей пока нет.</p>
        )}
      </Card>
      <Card className="p-5">
        {ahead.length ? (
          <ColumnChart
            title="Предстоящие платежи"
            description={`Сколько осталось заплатить по месяцам по текущему графику${ahead.length === 24 ? " (ближайшие 24 месяца)" : ""}`}
            mode="stacked"
            categories={cats(ahead)}
            series={toSeries(ahead, debt.knownTotalRepayment ? "Проценты и комиссии (без разбивки)" : "Комиссии")}
            currency={cur}
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">По графику больше ничего нет.</p>
        )}
      </Card>
    </div>
  );
}

export default async function DebtPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; version?: string; payment?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const tab: Tab = TABS.find((t) => t.value === query.tab)?.value ?? "overview";
  const debt = await getDebtDetail(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const accounts = (await listAccounts(user.id)).map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }));
  const today = todayIn(user.timezone);

  const activeVersion = debt.versions.find((v) => v.isActive);
  const requestedVersion = Number.parseInt(query.version ?? "", 10);
  const viewingVersion = debt.versions.find((v) => v.version === requestedVersion && !v.isActive);
  const documents = tab === "documents" || tab === "payments" ? await listDebtDocuments(user.id, debt.id) : [];
  const snapshot = tab === "schedule" && viewingVersion ? await getScheduleSnapshot(user.id, debt.id, viewingVersion.version) : null;

  const paymentDebt = { id: debt.id, name: debt.name, currency: debt.currency, feeMode: debt.feeMode, currentPrincipal: debt.currentPrincipal };
  const nextItem = debt.schedule.find((i) => i.id === debt.nextPayment?.itemId) ?? null;
  const feeLabel = debt.knownTotalRepayment ? "Проценты и комиссии" : "Комиссии";
  const canPay = debt.status === "ACTIVE";

  return (
    <div className="grid gap-6">
      <Link href="/debts" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Debts
      </Link>

      <header className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <DebtIcon type={debt.type} className="size-12" />
            <div className="grid gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">{debt.name}</h1>
              <p className="text-sm text-muted-foreground">
                {debt.lender ? `${debt.lender} · ` : ""}
                {DEBT_TYPE_LABELS[debt.type]} · {REPAYMENT_TYPE_LABELS[debt.repaymentType]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {debt.status === "PAID_OFF" ? <Badge tone="success">Погашен</Badge> : null}
                {debt.status === "ARCHIVED" ? <Badge>В архиве</Badge> : null}
                {debt.nextPayment && debt.status === "ACTIVE" ? <PaymentStatusBadge status={debt.nextPayment.displayStatus} /> : null}
              </div>
            </div>
          </div>
          <DebtActions debt={paymentDebt} nextItem={nextItem} accounts={accounts} today={today} canPay={canPay} />
        </div>

        <Card className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-3">
            <div className="grid gap-1">
              <p className="text-xs text-muted-foreground">Осталось выплатить</p>
              <Money amount={debt.currentPrincipal} currency={debt.currency} className="text-3xl font-semibold tracking-tight" />
            </div>
            <ProgressBar percent={debt.paidPercent} label={`${debt.name}: выплачено`} tone={debt.status === "PAID_OFF" ? "success" : "primary"} />
            <p className="text-sm text-muted-foreground">
              выплачено <span className="tabular font-medium text-foreground">{formatPercent(debt.paidPercent)}</span> (<Money amount={debt.paidPrincipal} currency={debt.currency} />) ·{" "}
              осталось <span className="tabular">{formatPercent(debt.remainingPercent)}</span> из <Money amount={debt.principalBasis} currency={debt.currency} />
            </p>
          </div>
          {debt.nextPayment ? (
            <div className="grid gap-1 rounded-lg bg-muted/60 p-3 sm:min-w-56">
              <p className="text-xs text-muted-foreground">Следующий платёж · {daysLabel(debt.nextPayment.daysUntil)}</p>
              <Money amount={debt.nextPayment.amountDue} currency={debt.currency} className="text-lg font-semibold" />
              <p className="text-xs text-muted-foreground">{formatLocalDate(debt.nextPayment.dueDate, undefined, { weekday: "short", day: "numeric", month: "long" })}</p>
            </div>
          ) : null}
        </Card>
      </header>

      <nav aria-label="Разделы долга" className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "overview" ? `/debts/${debt.id}` : `/debts/${debt.id}?tab=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.value === "payments" ? <span className="tabular ml-1.5 text-xs text-muted-foreground">{debt.payments.length}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <Overview debt={debt} /> : null}

      {tab === "schedule" ? (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Версия:</span>
              {debt.versions.map((v) => {
                const selected = viewingVersion ? v.version === viewingVersion.version : v.isActive;
                return (
                  <Link
                    key={v.id}
                    href={v.isActive ? `/debts/${debt.id}?tab=schedule` : `/debts/${debt.id}?tab=schedule&version=${v.version}`}
                    aria-current={selected ? "true" : undefined}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs", selected ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                    title={v.note ?? undefined}
                  >
                    v{v.version} · {SCHEDULE_REASON_LABELS[v.reason as keyof typeof SCHEDULE_REASON_LABELS]}
                    {v.isActive ? " (текущая)" : ""}
                  </Link>
                );
              })}
            </div>
            {!viewingVersion && canPay && debt.schedule.some((i) => i.isOpen) ? (
              <ScheduleEditor debtId={debt.id} currency={debt.currency} openItems={debt.schedule.filter((i) => i.isOpen && i.status === "SCHEDULED")} principalToPlan={debt.principalToPlan} />
            ) : null}
          </div>
          {viewingVersion ? (
            <p className="rounded-lg bg-info-subtle px-3 py-2 text-sm text-info">
              Вы смотрите версию {viewingVersion.version} ({SCHEDULE_REASON_LABELS[viewingVersion.reason as keyof typeof SCHEDULE_REASON_LABELS]}) в том виде, в каком она действовала. Статусы — на сегодня.{" "}
              <Link href={`/debts/${debt.id}?tab=schedule`} className="font-medium underline">
                Вернуться к v{activeVersion?.version}
              </Link>
            </p>
          ) : null}
          {(snapshot ?? debt.schedule).length === 0 ? (
            <EmptyState icon={FileText} title="Платежей по графику нет" description={debt.status === "PAID_OFF" ? "Этот долг погашен." : undefined} />
          ) : (
            <ScheduleView items={snapshot ?? debt.schedule} debt={paymentDebt} accounts={accounts} today={today} readOnly={Boolean(snapshot) || !canPay} feeLabel={feeLabel} />
          )}
        </section>
      ) : null}

      {tab === "payments" ? (
        <PaymentHistory
          payments={debt.payments}
          currency={debt.currency}
          debtId={debt.id}
          receipts={documents.reduce<Record<string, { id: string; name: string }[]>>((byPayment, d) => {
            if (d.payment) (byPayment[d.payment.id] ??= []).push({ id: d.id, name: d.name });
            return byPayment;
          }, {})}
        />
      ) : null}

      {tab === "analytics" ? <DebtAnalytics debt={debt} /> : null}

      {tab === "documents" ? (
        <DebtDocuments
          debtId={debt.id}
          currency={debt.currency}
          documents={documents}
          payments={debt.payments.map((p) => ({ id: p.id, paymentDate: p.paymentDate, amount: p.actualAccountDebit, isReversed: p.isReversed }))}
          initialPaymentId={query.payment && debt.payments.some((p) => p.id === query.payment) ? query.payment : undefined}
        />
      ) : null}

      {tab === "settings" ? <DebtSettings debt={debt} /> : null}
    </div>
  );
}
