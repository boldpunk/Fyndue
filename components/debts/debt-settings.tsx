"use client";
import { Archive, ArchiveRestore, ArrowDownLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveDebtAction, recordDebtDisbursementAction, setDebtWeekendShiftAction, updateDebtAction } from "@/app/(app)/debts/actions";
import { MoneyInput } from "@/components/finance/money-input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { formatMoney } from "@/lib/finance/money";
import { toastActionError } from "@/lib/utils/action-toast";

type DebtForSettings = {
  id: string;
  name: string;
  lender: string | null;
  notes: string | null;
  status: "ACTIVE" | "PAID_OFF" | "ARCHIVED";
  shiftWeekends: boolean;
  currency: string;
  startDate: string;
  netAmountReceived: string | null;
  originalPrincipal: string;
};

/** «Деньги поступили на счёт» after the debt was created: the account balance gets the loan money. */
function DisbursementCard({ debt, accounts, today }: { debt: DebtForSettings; accounts: { id: string; name: string; currency: string }[]; today: string }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(formatMoney(debt.netAmountReceived ?? debt.originalPrincipal, "", { hideCurrency: true }));
  const [date, setDate] = useState(debt.startDate > today ? today : debt.startDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await recordDebtDisbursementAction({ id: debt.id, accountId, amount, date });
      if (!result.ok) return setError(Object.values(result.fieldErrors ?? {})[0] ?? result.error);
      toast.success("Поступление записано — баланс счёта обновлён");
      router.refresh();
    });
  return (
    <form
      noValidate
      className="grid max-w-xl gap-4 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-1">
        <p className="text-sm font-medium">Деньги по займу поступили на счёт</p>
        <p className="text-[13px] text-muted-foreground">
          Если при добавлении долга вы не указали, куда пришли деньги, — запишите это здесь. Это не доход: сумма просто появится на балансе счёта.
        </p>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет счёта в {debt.currency}. Сначала создайте его.</p>
      ) : (
        <>
          <Field label="На какой счёт" htmlFor="disb-account">
            <NativeSelect id="disb-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Сколько пришло" htmlFor="disb-amount" hint="Если банк удержал комиссию — сумма, которая реально пришла.">
              <MoneyInput id="disb-amount" value={amount} onChange={setAmount} currency={debt.currency} />
            </Field>
            <Field label="Когда" htmlFor="disb-date">
              <Input id="disb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending || !amount.trim() || !accountId}>
              <ArrowDownLeft /> Записать поступление
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

export function DebtSettings({
  debt,
  accounts = [],
  disbursed = true,
  today,
}: {
  debt: DebtForSettings;
  accounts?: { id: string; name: string; currency: string }[];
  disbursed?: boolean;
  today: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(debt.name);
  const [lender, setLender] = useState(debt.lender ?? "");
  const [notes, setNotes] = useState(debt.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setErrors({});
      const result = await updateDebtAction({ id: debt.id, name, lender, notes });
      if (!result.ok) return setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
      toast.success("Долг обновлён");
      router.refresh();
    });

  const toggleWeekendShift = (on: boolean) =>
    startTransition(async () => {
      const result = await setDebtWeekendShiftAction({ id: debt.id, shiftWeekends: on });
      if (!result.ok) return void toastActionError(result);
      const moved = result.data.moved;
      toast.success(
        on
          ? moved
            ? `Перенесено платежей: ${moved}. График обновлён новой версией.`
            : "Включено. Сейчас ни один платёж не выпадает на выходной."
          : moved
            ? "Платежи возвращены на даты по договору."
            : "Выключено.",
      );
      router.refresh();
    });

  const toggleArchive = () =>
    startTransition(async () => {
      const archived = debt.status !== "ARCHIVED";
      const result = await archiveDebtAction({ id: debt.id, archived });
      if (!result.ok) return void toastActionError(result);
      toast.success(archived ? "Долг перенесён в архив" : "Долг восстановлен");
      router.refresh();
    });

  return (
    <div className="grid gap-8">
      <form
        className="grid max-w-xl gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Название" htmlFor="debt-name" error={errors.name}>
          <Input id="debt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Кредитор" htmlFor="debt-lender" error={errors.lender}>
          <Input id="debt-lender" value={lender} onChange={(e) => setLender(e.target.value)} maxLength={80} placeholder="Необязательно" />
        </Field>
        <Field label="Заметки" htmlFor="debt-notes" error={errors.notes}>
          <Textarea id="debt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} />
        </Field>
        {errors.form ? <p role="alert" className="text-sm text-danger">{errors.form}</p> : null}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </form>

      {!disbursed && debt.status !== "ARCHIVED" ? <DisbursementCard debt={debt} accounts={accounts} today={today} /> : null}

      <label className="flex max-w-xl items-start justify-between gap-4 rounded-xl border p-4">
        <span className="grid gap-1">
          <span className="text-sm font-medium">Переносить платёж с выходных и праздников</span>
          <span className="text-[13px] text-muted-foreground">
            Как в банке: платёж на субботу, воскресенье или праздник переносится на следующий рабочий день, а проценты за эти дни добавляются к следующему платежу. Меняются только неоплаченные платежи; старый график сохранится в истории версий.
          </span>
        </span>
        <Switch checked={debt.shiftWeekends} onCheckedChange={toggleWeekendShift} disabled={pending} aria-label="Переносить платёж с выходных и праздников" />
      </label>

      <div className="grid max-w-xl gap-2 rounded-xl border p-4">
        <p className="text-sm font-medium">{debt.status === "ARCHIVED" ? "Восстановить долг" : "Перенести долг в архив"}</p>
        <p className="text-[13px] text-muted-foreground">
          {debt.status === "ARCHIVED"
            ? "Он вернётся в активные или погашенные долги."
            : "Скроет его из активных долгов и напоминаний. График, платежи и история сохранятся."}
        </p>
        <div>
          <Button variant="outline" onClick={toggleArchive} disabled={pending}>
            {debt.status === "ARCHIVED" ? <ArchiveRestore /> : <Archive />}
            {debt.status === "ARCHIVED" ? "Восстановить" : "В архив"}
          </Button>
        </div>
      </div>
    </div>
  );
}
