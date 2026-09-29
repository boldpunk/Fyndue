"use client";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createDebtAction } from "@/app/(app)/debts/actions";
import { Money } from "@/components/finance/money";
import { MoneyInput } from "@/components/finance/money-input";
import type { AccountOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import {
  DAY_COUNT_CONVENTIONS,
  DAY_COUNT_LABELS,
  DEBT_TYPES,
  DEBT_TYPE_LABELS,
  FEE_MODES,
  FEE_MODE_LABELS,
  REPAYMENT_TYPES,
  REPAYMENT_TYPE_HINTS,
  REPAYMENT_TYPE_LABELS,
  type DebtTypeCode,
  type RepaymentTypeCode,
} from "@/lib/constants/debts";
import { CURRENCIES, CURRENCY_LABELS } from "@/lib/constants/finance";
import { buildDebtPlan } from "@/lib/finance/debt-plan";
import { addMonthsClamped, formatLocalDate } from "@/lib/finance/dates";
import { toMoneyString } from "@/lib/finance/money";
import { scheduleTotals } from "@/lib/finance/schedule";
import { cn } from "@/lib/utils/cn";
import { debtCreateSchema } from "@/lib/validations/debts";
import { DEBT_TYPE_ICONS } from "./debt-card";

type ManualRow = { dueDate: string; principal: string; interest: string; fees: string };
type TotalRow = { dueDate: string; total: string };

type Values = {
  type: DebtTypeCode;
  name: string;
  lender: string;
  currency: (typeof CURRENCIES)[number];
  originalPrincipal: string;
  paidBeforeTracking: string;
  feeMode: (typeof FEE_MODES)[number];
  originationFee: string;
  netAmountReceived: string;
  disbursementAccountId: string;
  repaymentType: RepaymentTypeCode;
  knownTotalRepayment: boolean;
  annualInterestRate: string;
  dayCountConvention: (typeof DAY_COUNT_CONVENTIONS)[number];
  roundingScale: "2" | "0";
  startDate: string;
  firstPaymentDate: string;
  paymentDay: string;
  termMonths: string;
  installmentMode: "count" | "amount";
  installmentAmount: string;
  manualLines: ManualRow[];
  knownTotalLines: TotalRow[];
  notes: string;
};

const STEPS = [
  { id: "type", label: "Type" },
  { id: "details", label: "Details" },
  { id: "amount", label: "Amount" },
  { id: "model", label: "Repayment" },
  { id: "terms", label: "Terms" },
  { id: "schedule", label: "Schedule" },
  { id: "review", label: "Review" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const STEP_FIELDS: Record<StepId, string[]> = {
  type: ["type"],
  details: ["name", "lender", "currency"],
  amount: ["originalPrincipal", "paidBeforeTracking", "feeMode", "originationFee", "netAmountReceived", "disbursementAccountId"],
  model: ["repaymentType"],
  terms: ["annualInterestRate", "termMonths", "startDate", "firstPaymentDate", "paymentDay", "installmentAmount", "dayCountConvention", "roundingScale", "manualLines", "knownTotalLines", "notes"],
  schedule: [],
  review: [],
};

/** Sensible first guess of the repayment model for each debt type. */
const DEFAULT_MODEL: Record<DebtTypeCode, RepaymentTypeCode> = {
  CREDIT: "DIFFERENTIAL",
  CAR_LOAN: "INTEREST_FREE",
  INSTALLMENT: "INTEREST_FREE",
  MICROLOAN: "INTEREST_FREE",
  CREDIT_CARD: "MANUAL",
  MORTGAGE: "ANNUITY",
  PERSONAL: "INTEREST_FREE",
  OTHER: "MANUAL",
};

function toPayload(v: Values, clientRequestId: string) {
  const interestBearing = v.repaymentType === "DIFFERENTIAL" || v.repaymentType === "ANNUITY";
  const manual = v.repaymentType === "MANUAL" || v.repaymentType === "CUSTOM";
  return {
    clientRequestId,
    type: v.type,
    name: v.name,
    lender: v.lender,
    currency: v.currency,
    repaymentType: v.repaymentType,
    originalPrincipal: v.originalPrincipal,
    paidBeforeTracking: v.paidBeforeTracking,
    feeMode: v.feeMode,
    originationFee: v.feeMode === "NONE" ? "" : v.originationFee,
    netAmountReceived: v.feeMode === "CUSTOM" ? v.netAmountReceived : "",
    annualInterestRate: interestBearing && !v.knownTotalRepayment ? v.annualInterestRate : undefined,
    dayCountConvention: v.dayCountConvention,
    roundingScale: v.roundingScale === "0" ? 0 : 2,
    startDate: v.startDate,
    firstPaymentDate: v.knownTotalRepayment ? (v.knownTotalLines[0]?.dueDate ?? v.firstPaymentDate) : manual ? (v.manualLines[0]?.dueDate ?? v.firstPaymentDate) : v.firstPaymentDate,
    paymentDay: v.paymentDay,
    termMonths: v.repaymentType === "INTEREST_FREE" && v.installmentMode === "amount" ? "" : v.termMonths,
    installmentAmount: v.repaymentType === "INTEREST_FREE" && v.installmentMode === "amount" ? v.installmentAmount : "",
    knownTotalRepayment: v.knownTotalRepayment,
    manualLines: manual && !v.knownTotalRepayment ? v.manualLines : undefined,
    knownTotalLines: v.knownTotalRepayment ? v.knownTotalLines : undefined,
    disbursementAccountId: v.disbursementAccountId || undefined,
    notes: v.notes,
  };
}

function Choice({ selected, onClick, title, description, icon }: { selected: boolean; onClick: () => void; title: string; description?: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
        selected ? "border-primary bg-primary-subtle" : "bg-card hover:bg-muted/60",
      )}
    >
      {icon}
      <span className="grid gap-1">
        <span className="text-sm font-medium">{title}</span>
        {description ? <span className="text-[13px] text-muted-foreground">{description}</span> : null}
      </span>
    </button>
  );
}

export function DebtWizard({ accounts, today, defaultCurrency }: { accounts: AccountOption[]; today: string; defaultCurrency: Values["currency"] }) {
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showAllLines, setShowAllLines] = useState(false);
  const [pending, startTransition] = useTransition();
  const [v, setValues] = useState<Values>({
    type: "CREDIT",
    name: "",
    lender: "",
    currency: defaultCurrency,
    originalPrincipal: "",
    paidBeforeTracking: "",
    feeMode: "NONE",
    originationFee: "",
    netAmountReceived: "",
    disbursementAccountId: "",
    repaymentType: "DIFFERENTIAL",
    knownTotalRepayment: false,
    annualInterestRate: "",
    dayCountConvention: "MONTHLY_30_360",
    roundingScale: "2",
    startDate: today,
    firstPaymentDate: addMonthsClamped(today, 1),
    paymentDay: "",
    termMonths: "12",
    installmentMode: "count",
    installmentAmount: "",
    manualLines: [{ dueDate: addMonthsClamped(today, 1), principal: "", interest: "0", fees: "0" }],
    knownTotalLines: [{ dueDate: addMonthsClamped(today, 1), total: "" }],
    notes: "",
  });
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((s) => ({ ...s, [key]: value }));

  const payload = useMemo(() => toPayload(v, requestId), [v, requestId]);
  const parsed = useMemo(() => debtCreateSchema.safeParse(payload), [payload]);
  const planResult = useMemo(() => (parsed.success ? buildDebtPlan(parsed.data) : null), [parsed]);
  const plan = planResult?.ok ? planResult.plan : null;

  const current = STEPS[step]!.id;
  const interestBearing = v.repaymentType === "DIFFERENTIAL" || v.repaymentType === "ANNUITY";
  const manual = v.repaymentType === "MANUAL" || v.repaymentType === "CUSTOM";
  const receivingAccounts = accounts.filter((a) => a.currency === v.currency);
  const cur = v.currency;

  /** Errors for the fields owned by one step (the same schema the server uses). */
  const stepErrors = (id: StepId): Record<string, string> => {
    const found: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (STEP_FIELDS[id].includes(key)) found[key] ??= issue.path.length > 1 ? `Row ${Number(issue.path[1]) + 1}: ${issue.message}` : issue.message;
      }
    }
    if (id === "terms" && Object.keys(found).length === 0 && planResult && !planResult.ok) {
      found[planResult.field && STEP_FIELDS.terms.includes(planResult.field) ? planResult.field : "schedule"] = planResult.error;
    }
    if (id === "amount" && planResult && !planResult.ok && planResult.field && STEP_FIELDS.amount.includes(planResult.field)) {
      found[planResult.field] = planResult.error;
    }
    return found;
  };

  const next = () => {
    const found = stepErrors(current);
    setErrors(found);
    if (Object.keys(found).length) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };

  const save = () =>
    startTransition(async () => {
      setFormError(null);
      const result = await createDebtAction(payload);
      if (!result.ok) {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success("Debt added with its schedule");
      router.push(`/debts/${result.data.id}`);
      router.refresh();
    });

  const totals = plan ? scheduleTotals(plan.lines) : null;
  const visibleLines = plan ? (showAllLines || plan.lines.length <= 8 ? plan.lines : [...plan.lines.slice(0, 6), ...plan.lines.slice(-1)]) : [];

  return (
    <div className="grid gap-6">
      <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex shrink-0 items-center gap-1.5">
            <span
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-medium",
                i < step ? "bg-primary text-primary-foreground" : i === step ? "ring-2 ring-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("text-xs", i === step ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
            {i < STEPS.length - 1 ? <span aria-hidden className="mx-1 h-px w-4 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <Card className="grid gap-5 p-5 sm:p-6">
        {current === "type" ? (
          <>
            <h2 className="text-lg font-semibold">What kind of debt is it?</h2>
            <div role="radiogroup" aria-label="Debt type" className="grid gap-2 sm:grid-cols-2">
              {DEBT_TYPES.map((t) => {
                const Icon = DEBT_TYPE_ICONS[t];
                return (
                  <Choice
                    key={t}
                    selected={v.type === t}
                    onClick={() => setValues((s) => ({ ...s, type: t, repaymentType: DEFAULT_MODEL[t], name: s.name || DEBT_TYPE_LABELS[t] }))}
                    title={DEBT_TYPE_LABELS[t]}
                    icon={<Icon className="mt-0.5 size-5 text-primary" aria-hidden />}
                  />
                );
              })}
            </div>
          </>
        ) : null}

        {current === "details" ? (
          <>
            <h2 className="text-lg font-semibold">Basic information</h2>
            <Field label="Name" htmlFor="w-name" error={errors.name}>
              <Input id="w-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Car Installment" autoFocus />
            </Field>
            <Field label="Lender" htmlFor="w-lender" error={errors.lender}>
              <Input id="w-lender" value={v.lender} onChange={(e) => set("lender", e.target.value)} placeholder="Bank, dealer or person — optional" />
            </Field>
            <Field label="Currency" htmlFor="w-currency" error={errors.currency}>
              <NativeSelect id="w-currency" value={v.currency} onChange={(e) => set("currency", e.target.value as Values["currency"])}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} — {CURRENCY_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        ) : null}

        {current === "amount" ? (
          <>
            <h2 className="text-lg font-semibold">How much?</h2>
            <Field label="Original principal" htmlFor="w-principal" error={errors.originalPrincipal} hint="The contract amount you borrowed.">
              <MoneyInput id="w-principal" size="lg" currency={cur} value={v.originalPrincipal} onChange={(x) => set("originalPrincipal", x)} autoFocus />
            </Field>
            <Field
              label="Already paid before today"
              htmlFor="w-paid"
              error={errors.paidBeforeTracking}
              hint="Principal repaid before you started tracking it here. It counts toward progress but doesn't touch your accounts."
            >
              <MoneyInput id="w-paid" currency={cur} value={v.paidBeforeTracking} onChange={(x) => set("paidBeforeTracking", x)} placeholder="0" />
            </Field>
            <Field label="Fees" htmlFor="w-fee-mode" error={errors.feeMode}>
              <NativeSelect id="w-fee-mode" value={v.feeMode} onChange={(e) => set("feeMode", e.target.value as Values["feeMode"])}>
                {FEE_MODES.map((m) => (
                  <option key={m} value={m}>
                    {FEE_MODE_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {v.feeMode !== "NONE" ? (
              <Field
                label="Origination / service fee"
                htmlFor="w-fee"
                error={errors.originationFee}
                hint={v.feeMode === "FINANCED_INTO_DEBT" ? "Only choose this if the lender added the fee to your debt." : undefined}
              >
                <MoneyInput id="w-fee" currency={cur} value={v.originationFee} onChange={(x) => set("originationFee", x)} />
              </Field>
            ) : null}
            {v.feeMode === "CUSTOM" ? (
              <Field label="Net amount received" htmlFor="w-net" error={errors.netAmountReceived}>
                <MoneyInput id="w-net" currency={cur} value={v.netAmountReceived} onChange={(x) => set("netAmountReceived", x)} />
              </Field>
            ) : null}
            <Field
              label="Money received into"
              htmlFor="w-disbursement"
              error={errors.disbursementAccountId}
              hint="Only for a new loan whose money you want added to an account now. It is recorded as a loan disbursement — never as income."
            >
              <NativeSelect id="w-disbursement" value={v.disbursementAccountId} onChange={(e) => set("disbursementAccountId", e.target.value)}>
                <option value="">Don&apos;t record — the money was received earlier</option>
                {receivingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {plan && (v.feeMode !== "NONE" || v.disbursementAccountId) ? (
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-muted-foreground">Contract principal</dt><dd><Money amount={toMoneyString(plan.fee.contractPrincipal)} currency={cur} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">Net received</dt><dd><Money amount={toMoneyString(plan.fee.netReceived)} currency={cur} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">Fee withheld</dt><dd><Money amount={toMoneyString(plan.fee.withheldFee)} currency={cur} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">Debt basis</dt><dd><Money amount={toMoneyString(plan.fee.principalBasis)} currency={cur} /></dd></div>
              </dl>
            ) : null}
          </>
        ) : null}

        {current === "model" ? (
          <>
            <h2 className="text-lg font-semibold">How is it repaid?</h2>
            <div role="radiogroup" aria-label="Repayment model" className="grid gap-2">
              {REPAYMENT_TYPES.map((r) => (
                <Choice key={r} selected={v.repaymentType === r} onClick={() => set("repaymentType", r)} title={REPAYMENT_TYPE_LABELS[r]} description={REPAYMENT_TYPE_HINTS[r]} />
              ))}
            </div>
            <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">I know the exact total repayment amount</span>
                <span className="text-[13px] text-muted-foreground">
                  For lenders (e.g. microfinance) that give only the amount due, without an interest/fee split. Fyndue won&apos;t invent an interest formula.
                </span>
              </span>
              <Switch checked={v.knownTotalRepayment} onCheckedChange={(x) => set("knownTotalRepayment", x)} aria-label="I know the exact total repayment amount" />
            </label>
          </>
        ) : null}

        {current === "terms" ? (
          <>
            <h2 className="text-lg font-semibold">Terms</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="w-start" error={errors.startDate} hint="When the money was received / the contract began.">
                <Input id="w-start" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </Field>
              {!manual && !v.knownTotalRepayment ? (
                <Field label="Next payment date" htmlFor="w-first" error={errors.firstPaymentDate} hint="The first payment Fyndue should schedule.">
                  <Input id="w-first" type="date" value={v.firstPaymentDate} onChange={(e) => set("firstPaymentDate", e.target.value)} />
                </Field>
              ) : null}
            </div>

            {interestBearing && !v.knownTotalRepayment ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Annual interest rate, %" htmlFor="w-rate" error={errors.annualInterestRate}>
                  <Input id="w-rate" inputMode="decimal" value={v.annualInterestRate} onChange={(e) => set("annualInterestRate", e.target.value)} placeholder="e.g. 24" />
                </Field>
                <Field label="Number of payments" htmlFor="w-term" error={errors.termMonths} hint="Remaining monthly payments to schedule.">
                  <Input id="w-term" inputMode="numeric" value={v.termMonths} onChange={(e) => set("termMonths", e.target.value)} />
                </Field>
                <Field label="Interest calculation" htmlFor="w-daycount" hint="Check your contract; the bank's schedule always wins.">
                  <NativeSelect id="w-daycount" value={v.dayCountConvention} onChange={(e) => set("dayCountConvention", e.target.value as Values["dayCountConvention"])}>
                    {DAY_COUNT_CONVENTIONS.map((d) => (
                      <option key={d} value={d}>
                        {DAY_COUNT_LABELS[d]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Rounding" htmlFor="w-rounding">
                  <NativeSelect id="w-rounding" value={v.roundingScale} onChange={(e) => set("roundingScale", e.target.value as Values["roundingScale"])}>
                    <option value="2">To 0.01 (tiyin)</option>
                    <option value="0">To whole sums</option>
                  </NativeSelect>
                </Field>
              </div>
            ) : null}

            {v.repaymentType === "INTEREST_FREE" && !v.knownTotalRepayment ? (
              <div className="grid gap-4">
                <Segmented
                  label="Split by"
                  value={v.installmentMode}
                  onChange={(x) => set("installmentMode", x)}
                  options={[
                    { value: "count", label: "Number of installments" },
                    { value: "amount", label: "Monthly amount" },
                  ]}
                />
                {v.installmentMode === "count" ? (
                  <Field label="Number of installments" htmlFor="w-count" error={errors.termMonths}>
                    <Input id="w-count" inputMode="numeric" value={v.termMonths} onChange={(e) => set("termMonths", e.target.value)} />
                  </Field>
                ) : (
                  <Field label="Monthly amount" htmlFor="w-installment" error={errors.installmentAmount} hint="The last installment takes whatever remains.">
                    <MoneyInput id="w-installment" currency={cur} value={v.installmentAmount} onChange={(x) => set("installmentAmount", x)} />
                  </Field>
                )}
              </div>
            ) : null}

            {manual && !v.knownTotalRepayment ? (
              <LinesEditor
                label="Payments"
                error={errors.manualLines ?? errors.schedule}
                columns={["Due date", "Principal", "Interest", "Fees"]}
                rows={v.manualLines}
                empty={(last) => ({ dueDate: last ? addMonthsClamped(last.dueDate, 1) : v.firstPaymentDate, principal: "", interest: "0", fees: "0" })}
                onChange={(rows) => set("manualLines", rows)}
                fields={["principal", "interest", "fees"]}
                currency={cur}
              />
            ) : null}

            {v.knownTotalRepayment ? (
              <LinesEditor
                label="Amounts due"
                error={errors.knownTotalLines ?? errors.schedule}
                columns={["Due date", "Total to pay"]}
                rows={v.knownTotalLines}
                empty={(last) => ({ dueDate: last ? addMonthsClamped(last.dueDate, 1) : v.firstPaymentDate, total: "" })}
                onChange={(rows) => set("knownTotalLines", rows)}
                fields={["total"]}
                currency={cur}
              />
            ) : null}

            {errors.schedule && !manual && !v.knownTotalRepayment ? <p role="alert" className="text-sm text-danger">{errors.schedule}</p> : null}

            <Field label="Notes" htmlFor="w-notes">
              <Textarea id="w-notes" rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional — contract number, conditions…" />
            </Field>
          </>
        ) : null}

        {current === "schedule" && plan && totals ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Schedule preview</h2>
              {plan.isEstimate ? <p className="text-xs text-muted-foreground">Interest is an estimate — replace it with the bank&apos;s schedule any time.</p> : null}
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">Payments</dt><dd className="tabular font-medium">{plan.lines.length}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Principal</dt><dd><Money amount={toMoneyString(totals.principal)} currency={cur} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">{v.knownTotalRepayment ? "Interest & fees" : "Interest"}</dt><dd><Money amount={toMoneyString(v.knownTotalRepayment ? totals.fees : totals.interest)} currency={cur} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">Total to repay</dt><dd className="font-medium"><Money amount={toMoneyString(totals.total)} currency={cur} /></dd></div>
            </dl>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 text-right font-medium">Principal</th>
                    <th className="px-3 py-2 text-right font-medium">Interest</th>
                    <th className="px-3 py-2 text-right font-medium">Fees</th>
                    <th className="px-3 py-2 text-right font-medium">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleLines.map((l, i) => (
                    <tr key={l.installmentNumber}>
                      <td className="tabular px-3 py-2">{l.installmentNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {!showAllLines && plan.lines.length > 8 && i === 6 ? <span className="mr-1 text-muted-foreground">…</span> : null}
                        {formatLocalDate(l.dueDate)}
                      </td>
                      <td className="px-3 py-2 text-right"><Money amount={toMoneyString(l.principal)} currency={cur} hideCurrency /></td>
                      <td className="px-3 py-2 text-right"><Money amount={toMoneyString(l.interest)} currency={cur} hideCurrency /></td>
                      <td className="px-3 py-2 text-right"><Money amount={toMoneyString(l.fees)} currency={cur} hideCurrency /></td>
                      <td className="px-3 py-2 text-right font-medium"><Money amount={toMoneyString(l.total)} currency={cur} hideCurrency /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.lines.length > 8 ? (
              <Button variant="ghost" size="sm" className="w-fit" onClick={() => setShowAllLines((x) => !x)}>
                {showAllLines ? "Show fewer" : `Show all ${plan.lines.length} payments`}
              </Button>
            ) : null}
          </>
        ) : null}

        {current === "review" && plan ? (
          <>
            <h2 className="text-lg font-semibold">Review</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Debt</dt><dd className="font-medium">{v.name} · {DEBT_TYPE_LABELS[v.type]}{v.lender ? ` · ${v.lender}` : ""}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Repayment</dt><dd className="font-medium">{REPAYMENT_TYPE_LABELS[v.repaymentType]}{v.knownTotalRepayment ? " · known total" : ""}{interestBearing && !v.knownTotalRepayment ? ` · ${v.annualInterestRate}%` : ""}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Original principal</dt><dd><Money amount={toMoneyString(plan.fee.contractPrincipal)} currency={cur} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">Remaining to schedule</dt><dd><Money amount={toMoneyString(plan.remainingPrincipal)} currency={cur} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">Payments</dt><dd>{plan.lines.length}, first {plan.lines[0] ? formatLocalDate(plan.lines[0].dueDate) : "—"}, last {plan.lines.at(-1) ? formatLocalDate(plan.lines.at(-1)!.dueDate) : "—"}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">Account</dt>
                <dd>
                  {v.disbursementAccountId ? (
                    <>
                      <Money amount={toMoneyString(plan.fee.netReceived)} currency={cur} /> added to {receivingAccounts.find((a) => a.id === v.disbursementAccountId)?.name} as a loan disbursement
                    </>
                  ) : (
                    "No account changes"
                  )}
                </dd>
              </div>
            </dl>
            {formError ? <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">{formError}</p> : null}
          </>
        ) : null}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={step === 0 ? () => router.back() : back}>
          <ArrowLeft /> {step === 0 ? "Cancel" : "Back"}
        </Button>
        {current === "review" ? (
          <Button size="lg" onClick={save} disabled={pending || !plan}>
            {pending ? "Saving…" : "Save debt"}
          </Button>
        ) : (
          <Button size="lg" onClick={next}>
            Next <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}

function LinesEditor<Row extends { dueDate: string }>({
  label,
  columns,
  rows,
  fields,
  empty,
  onChange,
  error,
  currency,
}: {
  label: string;
  columns: string[];
  rows: Row[];
  fields: (keyof Row & string)[];
  empty: (last: Row | undefined) => Row;
  onChange: (rows: Row[]) => void;
  error?: string;
  currency: string;
}) {
  const update = (index: number, key: keyof Row & string, value: string) => onChange(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  const template = `1.2fr ${fields.map(() => "1fr").join(" ")} auto`;
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label} <span className="font-normal text-muted-foreground">({currency})</span></p>
      <div className="grid gap-2 text-xs text-muted-foreground" style={{ gridTemplateColumns: template }}>
        {columns.map((c) => (
          <span key={c}>{c}</span>
        ))}
        <span className="sr-only">Remove</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid items-center gap-2" style={{ gridTemplateColumns: template }}>
          <Input type="date" aria-label={`Payment ${i + 1} due date`} value={row.dueDate} onChange={(e) => update(i, "dueDate", e.target.value)} className="px-2" />
          {fields.map((f) => (
            <MoneyInput key={f} aria-label={`Payment ${i + 1} ${f}`} value={String(row[f] ?? "")} onChange={(x) => update(i, f, x)} className="px-2" />
          ))}
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove payment ${i + 1}`} disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => onChange([...rows, empty(rows.at(-1))])}>
        <Plus /> Add payment
      </Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
