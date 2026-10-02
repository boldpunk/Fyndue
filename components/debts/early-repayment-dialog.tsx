"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { earlyRepaymentAction, previewEarlyRepaymentAction } from "@/app/(app)/debts/actions";
import { Money } from "@/components/finance/money";
import { MoneyInput } from "@/components/finance/money-input";
import type { AccountOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Segmented } from "@/components/ui/segmented";
import { formatLocalDate } from "@/lib/finance/dates";
import { parseMoneyInput } from "@/lib/finance/money";
import type { EarlyRepaymentPreview } from "@/lib/services/debt-payments";
import type { PaymentDebt } from "./types";

type Strategy = "REDUCE_TERM" | "REDUCE_PAYMENT";

function EarlyRepaymentForm({
  debt,
  accounts,
  today,
  onDone,
}: {
  debt: PaymentDebt;
  accounts: AccountOption[];
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const usable = accounts.filter((a) => a.currency === debt.currency);
  const [requestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("REDUCE_TERM");
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [processingFee, setProcessingFee] = useState("0");
  const [preview, setPreview] = useState<{ key: string; data: EarlyRepaymentPreview | null; error: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Keyed on the parsed value, so regrouping "10000000" → "10,000,000" on blur keeps the preview.
  const normalized = parseMoneyInput(amount)?.toString() ?? "";
  const hasAmount = normalized !== "" && normalized !== "0";
  const previewKey = `${normalized}|${strategy}`;

  // Debounced server preview — the same regeneration the real payment will run.
  useEffect(() => {
    if (!hasAmount) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewEarlyRepaymentAction({ debtId: debt.id, amount: normalized, strategy });
      if (cancelled) return;
      setPreview(
        result.ok
          ? { key: previewKey, data: result.data, error: null }
          : { key: previewKey, data: null, error: result.fieldErrors?.amount ?? result.error },
      );
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized, strategy, debt.id, hasAmount, previewKey]);

  const current = hasAmount && preview?.key === previewKey ? preview : null;
  const shown = current?.data ?? null;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await earlyRepaymentAction({
        clientRequestId: requestId,
        debtId: debt.id,
        accountId,
        paymentDate: date,
        amount,
        processingFee: processingFee || "0",
        strategy,
      });
      if (!result.ok) return setError(result.error);
      toast.success("Досрочный платёж записан, график пересчитан");
      router.refresh();
      onDone();
    });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Остаток долга <Money amount={debt.currentPrincipal} currency={debt.currency} className="font-medium text-foreground" />.
        Вся сумма пойдёт в основной долг; оставшийся график пересчитается, а старый сохранится в истории.
      </p>
      <Field label="Сумма досрочного погашения" htmlFor="early-amount" error={current?.error ?? undefined}>
        <MoneyInput id="early-amount" size="lg" currency={debt.currency} value={amount} onChange={setAmount} autoFocus />
      </Field>
      <Segmented
        label="После досрочного платежа"
        value={strategy}
        onChange={setStrategy}
        options={[
          { value: "REDUCE_TERM", label: "Закончить раньше" },
          { value: "REDUCE_PAYMENT", label: "Платить меньше каждый месяц" },
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Со счёта" htmlFor="early-account">
          <NativeSelect id="early-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Дата" htmlFor="early-date">
          <Input id="early-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Комиссия за перевод" htmlFor="early-fee">
        <MoneyInput id="early-fee" value={processingFee} onChange={setProcessingFee} />
      </Field>

      {shown ? (
        <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Было: дата погашения</dt>
            <dd className="font-medium">{shown.oldPayoffDate ? formatLocalDate(shown.oldPayoffDate) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Станет: дата погашения</dt>
            <dd className="font-medium">{shown.newPayoffDate ? formatLocalDate(shown.newPayoffDate) : "Погашен"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Срок короче на (мес.)</dt>
            <dd className="tabular font-medium">{shown.monthsReduced}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Остаток после</dt>
            <dd className="font-medium">
              <Money amount={shown.principalAfter} currency={debt.currency} />
            </dd>
          </div>
          {shown.isEstimate ? (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Экономия на процентах (оценка)</dt>
              <dd className="font-medium text-success">
                <Money amount={shown.interestSavedEstimate} currency={debt.currency} />
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">Это оценка, пока её не подтвердит график банка.</dd>
            </div>
          ) : null}
          {shown.newLines[0] ? (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Следующий платёж станет</dt>
              <dd className="font-medium">
                <Money amount={shown.newLines[0].total} currency={debt.currency} /> — {formatLocalDate(shown.newLines[0].dueDate)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending || !shown}>
        {pending ? "Записываем…" : "Подтвердить досрочный платёж"}
      </Button>
    </form>
  );
}

export function EarlyRepaymentDialog({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: PaymentDebt;
  accounts: AccountOption[];
  today: string;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Досрочное погашение">
      {open ? <EarlyRepaymentForm {...props} onDone={() => onOpenChange(false)} /> : null}
    </ResponsiveDialog>
  );
}
