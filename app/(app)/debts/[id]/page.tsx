import { ArrowLeft, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DebtIcon } from "@/components/debts/debt-card";
import { DebtActions } from "@/components/debts/debt-actions";
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
import { formatLocalDate, todayIn } from "@/lib/finance/dates";
import { groupByMonth } from "@/lib/finance/debt-cost";
import { money, toMoneyString } from "@/lib/finance/money";
import { ColumnChart } from "@/components/charts/column-chart";
import { listAccounts } from "@/lib/services/accounts";
import { getDebtDetail, getScheduleSnapshot, type DebtDetailDTO } from "@/lib/services/debts";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Debt" };

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "schedule", label: "Schedule" },
  { value: "payments", label: "Payments" },
  { value: "analytics", label: "Analytics" },
  { value: "documents", label: "Documents" },
  { value: "settings", label: "Settings" },
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
  const feeLabel = debt.knownTotalRepayment ? "Interest & fees (not itemised)" : "Fees";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="grid gap-4 p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Principal</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Original amount">{m(debt.originalPrincipal)}</Stat>
          {debt.principalBasis !== debt.originalPrincipal ? <Stat label="Debt basis (incl. financed fee)">{m(debt.principalBasis)}</Stat> : null}
          <Stat label="Paid amount">{m(debt.paidPrincipal)}</Stat>
          <Stat label="Remaining amount">{m(debt.currentPrincipal)}</Stat>
          <Stat label="Percentage paid">{debt.paidPercent}%</Stat>
          <Stat label="Percentage remaining">{debt.remainingPercent}%</Stat>
          {money(debt.paidBeforeTracking).gt(0) ? <Stat label="Paid before Fyndue">{m(debt.paidBeforeTracking)}</Stat> : null}
          <Stat label="Paid through Fyndue">{m(debt.cost.principalPaid)}</Stat>
        </dl>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="text-sm font-medium text-muted-foreground">What&apos;s ahead</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Payments completed">{debt.paymentsCompleted}</Stat>
          <Stat label="Payments remaining">{debt.paymentsRemaining}</Stat>
          <Stat label="Next payment">
            {debt.nextPayment ? (
              <>
                <Money amount={debt.nextPayment.amountDue} currency={cur} /> · {formatLocalDate(debt.nextPayment.dueDate)}
              </>
            ) : (
              "—"
            )}
          </Stat>
          <Stat label="Days until next payment">{debt.nextPayment ? daysLabel(debt.nextPayment.daysUntil) : "—"}</Stat>
          <Stat label="Projected payoff date">{debt.projectedPayoffDate ? formatLocalDate(debt.projectedPayoffDate) : "—"}</Stat>
          <Stat label="Remaining principal">{m(debt.currentPrincipal)}</Stat>
          <Stat label={debt.hasEstimates ? "Expected future interest (estimate)" : "Expected future interest"}>{m(debt.remainingInterestEstimate)}</Stat>
          <Stat label="Planned future payments" hint="Principal + interest + fees still scheduled">
            {m(debt.plannedFutureTotal)}
          </Stat>
        </dl>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Cost of this debt so far</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Interest paid">{m(debt.cost.interestPaid)}</Stat>
          <Stat label="Origination / service fees">{m(debt.cost.originationFeesPaid)}</Stat>
          <Stat label="Card / transfer fees">{m(debt.cost.processingFeesPaid)}</Stat>
          <Stat label="Other fees">{m(debt.cost.otherFeesPaid)}</Stat>
          <Stat label="Penalties">{m(debt.cost.penaltiesPaid)}</Stat>
          <Stat label="Total cost above principal">{m(debt.cost.costAbovePrincipal)}</Stat>
          <Stat label="Total cash outflow" hint="What actually left your accounts">
            {m(debt.cost.cashOutflow)}
          </Stat>
        </dl>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Terms</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Repayment model">{REPAYMENT_TYPE_LABELS[debt.repaymentType]}</Stat>
          <Stat label="Annual rate">{debt.annualInterestRate ? `${Number(debt.annualInterestRate)}%` : "0%"}</Stat>
          {debt.annualInterestRate ? <Stat label="Interest method">{DAY_COUNT_LABELS[debt.dayCountConvention]}</Stat> : null}
          <Stat label="Start date">{formatLocalDate(debt.startDate)}</Stat>
          {debt.firstPaymentDate ? <Stat label="First tracked payment">{formatLocalDate(debt.firstPaymentDate)}</Stat> : null}
          {debt.feeMode !== "NONE" ? <Stat label="Fee">{FEE_MODE_LABELS[debt.feeMode]}</Stat> : null}
          {debt.originationFeeAmount && money(debt.originationFeeAmount).gt(0) ? <Stat label="Fee amount">{m(debt.originationFeeAmount)}</Stat> : null}
          {debt.netAmountReceived && debt.netAmountReceived !== debt.originalPrincipal ? <Stat label="Net amount received">{m(debt.netAmountReceived)}</Stat> : null}
          {debt.contractTotalRepayment ? <Stat label={debt.knownTotalRepayment ? "Total repayment (from lender)" : "Contract repayment (before interest)"}>{m(debt.contractTotalRepayment)}</Stat> : null}
          {debt.knownTotalRepayment ? <Stat label="Schedule note">{feeLabel} are shown in the fees column</Stat> : null}
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
    { key: "principal", label: "Principal", color: "var(--viz-1)", values: rows.map((r) => toMoneyString(r.principal)) },
    { key: "interest", label: debt.hasEstimates ? "Interest (estimate)" : "Interest", color: "var(--viz-2)", values: rows.map((r) => toMoneyString(r.interest)) },
    { key: "fees", label: feesLabel, color: "var(--viz-3)", values: rows.map((r) => toMoneyString(r.fees)) },
  ];
  const cats = (rows: typeof paid) =>
    rows.map((r) => ({
      key: r.key,
      label: formatLocalDate(`${r.key}-01`, "en-US", { month: "short" }),
      fullLabel: formatLocalDate(`${r.key}-01`, "en-US", { month: "long", year: "numeric" }),
    }));
  return (
    <div className="grid gap-4">
      <Card className="p-5">
        {paid.length ? (
          <ColumnChart title="Payments made" description="Non-reversed payments by month, split by what they paid" mode="stacked" categories={cats(paid)} series={toSeries(paid, "Fees & penalties")} currency={cur} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        )}
      </Card>
      <Card className="p-5">
        {ahead.length ? (
          <ColumnChart
            title="Payments ahead"
            description={`Still owed per month on the current schedule${ahead.length === 24 ? " (next 24 months)" : ""}`}
            mode="stacked"
            categories={cats(ahead)}
            series={toSeries(ahead, debt.knownTotalRepayment ? "Interest & fees (not itemised)" : "Fees")}
            currency={cur}
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing left on the schedule.</p>
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
  searchParams: Promise<{ tab?: string; version?: string }>;
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
  const snapshot = tab === "schedule" && viewingVersion ? await getScheduleSnapshot(user.id, debt.id, viewingVersion.version) : null;

  const paymentDebt = { id: debt.id, name: debt.name, currency: debt.currency, feeMode: debt.feeMode, currentPrincipal: debt.currentPrincipal };
  const nextItem = debt.schedule.find((i) => i.id === debt.nextPayment?.itemId) ?? null;
  const feeLabel = debt.knownTotalRepayment ? "Interest & fees" : "Fees";
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
                {debt.status === "PAID_OFF" ? <Badge tone="success">Paid off</Badge> : null}
                {debt.status === "ARCHIVED" ? <Badge>Archived</Badge> : null}
                {debt.nextPayment && debt.status === "ACTIVE" ? <PaymentStatusBadge status={debt.nextPayment.displayStatus} /> : null}
              </div>
            </div>
          </div>
          <DebtActions debt={paymentDebt} nextItem={nextItem} accounts={accounts} today={today} canPay={canPay} />
        </div>

        <Card className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-3">
            <div className="grid gap-1">
              <p className="text-xs text-muted-foreground">Remaining principal</p>
              <Money amount={debt.currentPrincipal} currency={debt.currency} className="text-3xl font-semibold tracking-tight" />
            </div>
            <ProgressBar percent={debt.paidPercent} label={`${debt.name} repaid`} tone={debt.status === "PAID_OFF" ? "success" : "primary"} />
            <p className="text-sm text-muted-foreground">
              <span className="tabular font-medium text-foreground">{debt.paidPercent}%</span> paid (<Money amount={debt.paidPrincipal} currency={debt.currency} />) ·{" "}
              <span className="tabular">{debt.remainingPercent}%</span> remaining of <Money amount={debt.principalBasis} currency={debt.currency} />
            </p>
          </div>
          {debt.nextPayment ? (
            <div className="grid gap-1 rounded-lg bg-muted/60 p-3 sm:min-w-56">
              <p className="text-xs text-muted-foreground">Next payment · {daysLabel(debt.nextPayment.daysUntil)}</p>
              <Money amount={debt.nextPayment.amountDue} currency={debt.currency} className="text-lg font-semibold" />
              <p className="text-xs text-muted-foreground">{formatLocalDate(debt.nextPayment.dueDate, "en-US", { weekday: "short", day: "numeric", month: "long" })}</p>
            </div>
          ) : null}
        </Card>
      </header>

      <nav aria-label="Debt sections" className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
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
              <span className="text-muted-foreground">Version:</span>
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
                    {v.isActive ? " (current)" : ""}
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
              Viewing version {viewingVersion.version} ({SCHEDULE_REASON_LABELS[viewingVersion.reason as keyof typeof SCHEDULE_REASON_LABELS]}) as it stood when it was current. Statuses show today&apos;s state.{" "}
              <Link href={`/debts/${debt.id}?tab=schedule`} className="font-medium underline">
                Back to v{activeVersion?.version}
              </Link>
            </p>
          ) : null}
          {(snapshot ?? debt.schedule).length === 0 ? (
            <EmptyState icon={FileText} title="No payments scheduled" description={debt.status === "PAID_OFF" ? "This debt is paid off." : undefined} />
          ) : (
            <ScheduleView items={snapshot ?? debt.schedule} debt={paymentDebt} accounts={accounts} today={today} readOnly={Boolean(snapshot) || !canPay} feeLabel={feeLabel} />
          )}
        </section>
      ) : null}

      {tab === "payments" ? <PaymentHistory payments={debt.payments} currency={debt.currency} /> : null}

      {tab === "analytics" ? <DebtAnalytics debt={debt} /> : null}

      {tab === "documents" ? (
        <EmptyState icon={FileText} title="Documents arrive in Phase 6" description="Private storage for loan agreements, receipts and bank schedules." />
      ) : null}

      {tab === "settings" ? <DebtSettings debt={debt} /> : null}
    </div>
  );
}
