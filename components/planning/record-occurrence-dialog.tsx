"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { recordOccurrenceAction } from "@/app/(app)/planning-actions";
import { MoneyInput } from "@/components/finance/money-input";
import type { AccountOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { formatLocalDate } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";

export type OccurrenceTarget = {
  recurringId: string;
  occurrenceDate: string;
  name: string;
  amount: string;
  currency: string;
  accountId: string;
  direction: "IN" | "OUT";
};

function RecordForm({ target, accounts, today, onDone }: { target: OccurrenceTarget; accounts: AccountOption[]; today: string; onDone: () => void }) {
  const router = useRouter();
  const usable = accounts.filter((a) => a.currency === target.currency);
  const [requestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(formatMoney(target.amount, "", { hideCurrency: true }));
  const [accountId, setAccountId] = useState(usable.some((a) => a.id === target.accountId) ? target.accountId : (usable[0]?.id ?? ""));
  const [date, setDate] = useState(target.occurrenceDate > today ? today : target.occurrenceDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await recordOccurrenceAction({ clientRequestId: requestId, recurringId: target.recurringId, occurrenceDate: target.occurrenceDate, amount, date, accountId });
      if (!result.ok) return setError(result.fieldErrors?.amount ?? result.error);
      toast.success(target.direction === "IN" ? "Доход записан" : "Платёж записан");
      router.refresh();
      onDone();
    });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Запланировано на {formatLocalDate(target.occurrenceDate, undefined, { weekday: "short", day: "numeric", month: "long" })}. Запишите, сколько на самом деле {target.direction === "IN" ? "пришло" : "ушло со счёта"}.
      </p>
      <Field label="Сумма" htmlFor="occ-amount" error={error ?? undefined}>
        <MoneyInput id="occ-amount" size="lg" currency={target.currency} value={amount} onChange={setAmount} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Счёт" htmlFor="occ-account">
          <NativeSelect id="occ-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Дата" htmlFor="occ-date">
          <Input id="occ-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Записываем…" : target.direction === "IN" ? "Записать доход" : "Записать платёж"}
      </Button>
    </form>
  );
}

export function RecordOccurrenceDialog({
  target,
  onClose,
  accounts,
  today,
}: {
  target: OccurrenceTarget | null;
  onClose: () => void;
  accounts: AccountOption[];
  today: string;
}) {
  return (
    <ResponsiveDialog open={target !== null} onOpenChange={(o) => !o && onClose()} title={target ? `Записать · ${target.name}` : "Записать"}>
      {target ? <RecordForm key={`${target.recurringId}-${target.occurrenceDate}`} target={target} accounts={accounts} today={today} onDone={onClose} /> : null}
    </ResponsiveDialog>
  );
}
