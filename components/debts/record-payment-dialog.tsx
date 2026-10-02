"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { recordPaymentAction } from "@/app/(app)/debts/actions";
import { Money } from "@/components/finance/money";
import { MoneyInput } from "@/components/finance/money-input";
import type { AccountOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Switch } from "@/components/ui/switch";
import { formatLocalDate } from "@/lib/finance/dates";
import { formatMoney, money, parseMoneyInput, toMoneyString } from "@/lib/finance/money";
import { itemRemaining, paymentTotals, suggestBreakdown } from "@/lib/finance/payment-allocation";
import type { PaymentDebt, PaymentItem } from "./types";

type Fields = { principal: string; interest: string; fees: string; penalty: string; processingFee: string };

/** Pre-filled amounts, grouped for legibility ("4,099,333.33"); parseMoneyInput reads them back. */
const plain = (value: { toFixed(n: number): string }) => formatMoney(value.toFixed(2), "", { hideCurrency: true });
const parse = (value: string) => parseMoneyInput(value) ?? money(0);

function PaymentForm({
  debt,
  item,
  accounts,
  today,
  onDone,
}: {
  debt: PaymentDebt;
  item: PaymentItem | null;
  accounts: AccountOption[];
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requestId] = useState(() => crypto.randomUUID());
  const usable = accounts.filter((a) => a.currency === debt.currency);
  const remaining = useMemo(() => (item ? itemRemaining(item) : null), [item]);
  const initial = remaining ? suggestBreakdown(remaining) : null;

  const [amount, setAmount] = useState(remaining ? plain(remaining.total) : "");
  const [fields, setFields] = useState<Fields>({
    principal: initial ? plain(initial.principal) : "",
    interest: initial ? plain(initial.interest) : "0",
    fees: initial ? plain(initial.fees) : "0",
    penalty: "0",
    processingFee: "0",
  });
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [settles, setSettles] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // The fee column maps to an origination fee for "added on top" loans, otherwise "other fees".
  const feeKey = debt.feeMode === "ADDED_ON_TOP" ? "originationFee" : "otherFee";
  const feeLabel = debt.feeMode === "ADDED_ON_TOP" ? "Комиссия за выдачу / обслуживание" : "Комиссии";

  const breakdown = {
    principal: parse(fields.principal),
    interest: parse(fields.interest),
    originationFee: feeKey === "originationFee" ? parse(fields.fees) : money(0),
    otherFee: feeKey === "otherFee" ? parse(fields.fees) : money(0),
    penalty: parse(fields.penalty),
    processingFee: parse(fields.processingFee),
  };
  const totals = paymentTotals(breakdown);
  const coversPrincipal = remaining ? breakdown.principal.gte(remaining.principal) : false;
  const coversAll = remaining ? breakdown.principal.plus(breakdown.interest).plus(parse(fields.fees)).gte(remaining.total) : false;

  const onAmount = (value: string) => {
    setAmount(value);
    const parsed = parseMoneyInput(value);
    if (remaining && parsed) {
      const split = suggestBreakdown(remaining, parsed);
      setFields((f) => ({ ...f, principal: plain(split.principal), interest: plain(split.interest), fees: plain(split.fees) }));
    }
  };
  const set = (key: keyof Fields) => (value: string) => setFields((f) => ({ ...f, [key]: value }));

  const submit = () =>
    startTransition(async () => {
      setErrors({});
      const payload = {
        clientRequestId: requestId,
        debtId: debt.id,
        scheduleItemId: item?.id,
        accountId,
        paymentDate: date,
        principal: fields.principal || "0",
        interest: fields.interest || "0",
        originationFee: feeKey === "originationFee" ? fields.fees || "0" : "0",
        otherFee: feeKey === "otherFee" ? fields.fees || "0" : "0",
        penalty: fields.penalty || "0",
        processingFee: fields.processingFee || "0",
        settlesItem: settles,
        note,
      };
      const result = await recordPaymentAction(payload);
      if (!result.ok) {
        setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
        return;
      }
      toast.success(coversAll || settles ? "Платёж записан, этот месяц оплачен" : "Частичный платёж записан");
      router.refresh();
      onDone();
    });

  if (usable.length === 0) {
    return <p className="text-sm text-muted-foreground">Сначала добавьте счёт в {debt.currency}: платежи списываются с реального счёта.</p>;
  }

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {item && remaining ? (
        <div className="grid gap-1 rounded-lg bg-muted/60 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">
              Платёж №{item.installmentNumber} · {formatLocalDate(item.dueDate)}
            </span>
            <span>
              По графику <Money amount={item.plannedTotal} currency={debt.currency} className="font-medium" />
            </span>
          </div>
          {money(item.paidTotal).gt(0) ? (
            <div className="flex justify-between gap-3 text-muted-foreground">
              <span>
                Оплачено <Money amount={item.paidTotal} currency={debt.currency} />
              </span>
              <span>
                Осталось <Money amount={toMoneyString(remaining.total)} currency={debt.currency} className="font-medium text-foreground" />
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {item ? (
        <Field
          label="Сколько оплачено"
          htmlFor="pay-amount"
          hint="Распределяется автоматически: сначала комиссии, потом проценты, потом основной долг. Если банк распределил иначе, поправьте ниже."
        >
          <MoneyInput id="pay-amount" size="lg" currency={debt.currency} value={amount} onChange={onAmount} autoFocus />
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Основной долг" htmlFor="pay-principal" error={errors.principal}>
          <MoneyInput id="pay-principal" value={fields.principal} onChange={set("principal")} />
        </Field>
        <Field label="Проценты" htmlFor="pay-interest" error={errors.interest}>
          <MoneyInput id="pay-interest" value={fields.interest} onChange={set("interest")} />
        </Field>
        <Field label={feeLabel} htmlFor="pay-fees" error={errors.originationFee ?? errors.otherFee}>
          <MoneyInput id="pay-fees" value={fields.fees} onChange={set("fees")} />
        </Field>
        <Field label="Штраф" htmlFor="pay-penalty" error={errors.penalty}>
          <MoneyInput id="pay-penalty" value={fields.penalty} onChange={set("penalty")} />
        </Field>
      </div>
      <Field
        label="Комиссия за перевод"
        htmlFor="pay-processing"
        error={errors.processingFee}
        hint="Её берёт банк или карта за перевод. Списывается со счёта, но в счёт долга не идёт."
      >
        <MoneyInput id="pay-processing" value={fields.processingFee} onChange={set("processingFee")} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Со счёта" htmlFor="pay-account" error={errors.accountId}>
          <NativeSelect id="pay-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Дата" htmlFor="pay-date" error={errors.paymentDate}>
          <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Комментарий" htmlFor="pay-note">
        <Textarea id="pay-note" rows={2} placeholder="Необязательно" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {item && coversPrincipal && !coversAll ? (
        <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Этот месяц оплачен полностью</span>
            <span className="text-[13px] text-muted-foreground">Включите, если банк начислил меньше процентов или комиссий, чем в расчёте.</span>
          </span>
          <Switch checked={settles} onCheckedChange={setSettles} aria-label="Этот месяц оплачен полностью" />
        </label>
      ) : null}

      <dl className="grid gap-1.5 rounded-lg border p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">В счёт долга</dt>
          <dd>
            <Money amount={toMoneyString(totals.amountAppliedToDebt)} currency={debt.currency} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Комиссия за перевод</dt>
          <dd>
            <Money amount={toMoneyString(breakdown.processingFee)} currency={debt.currency} />
          </dd>
        </div>
        <div className="flex justify-between border-t pt-1.5 font-medium">
          <dt>Спишется со счёта</dt>
          <dd>
            <Money amount={toMoneyString(totals.actualAccountDebit)} currency={debt.currency} />
          </dd>
        </div>
      </dl>

      {errors.form ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {errors.form}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Записываем…" : "Подтвердить платёж"}
      </Button>
    </form>
  );
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: PaymentDebt;
  item: PaymentItem | null;
  accounts: AccountOption[];
  today: string;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Оплата · ${props.debt.name}`}>
      {open ? <PaymentForm key={props.item?.id ?? "none"} {...props} onDone={() => onOpenChange(false)} /> : null}
    </ResponsiveDialog>
  );
}
