"use client";
import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmIncomeAction, correctTransactionAction, voidTransactionAction } from "@/app/(app)/transactions/actions";
import { MoneyInput } from "@/components/finance/money-input";
import { formatMoney } from "@/lib/finance/money";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { TransactionDTO } from "@/lib/services/transactions";
import { toastActionError } from "@/lib/utils/action-toast";

type AccountChoice = { id: string; name: string; currency: string };

/** Date (and for a loan disbursement: amount and account) of operations the main form doesn't edit. */
function CorrectionDialog({ transaction: t, accounts, open, onOpenChange }: { transaction: TransactionDTO; accounts: AccountChoice[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const disbursement = t.type === "LOAN_DISBURSEMENT";
  const [date, setDate] = useState(t.date);
  const [amount, setAmount] = useState(formatMoney(t.amount, "", { hideCurrency: true }));
  const [accountId, setAccountId] = useState(t.account.id);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await correctTransactionAction(disbursement ? { id: t.id, date, amount, accountId } : { id: t.id, date });
      if (!result.ok) return setError(Object.values(result.fieldErrors ?? {})[0] ?? result.error);
      toast.success("Операция исправлена");
      onOpenChange(false);
      router.refresh();
    });
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={disbursement ? "Исправить получение займа" : t.type === "DEBT_PAYMENT" ? "Исправить дату платежа" : "Исправить дату"}
      description={t.type === "DEBT_PAYMENT" ? "Сумму платежа по долгу исправляют отменой на вкладке «Платежи» долга." : undefined}
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Дата" htmlFor="fix-date">
          <Input id="fix-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {disbursement ? (
          <>
            <Field label="Сколько пришло" htmlFor="fix-amount">
              <MoneyInput id="fix-amount" value={amount} onChange={setAmount} currency={t.currency} />
            </Field>
            <Field label="На какой счёт" htmlFor="fix-account">
              <NativeSelect id="fix-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </Button>
      </form>
    </ResponsiveDialog>
  );
}

export function TransactionDetailActions({ transaction, accounts = [] }: { transaction: TransactionDTO; accounts?: AccountChoice[] }) {
  const router = useRouter();
  const [voidOpen, setVoidOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const correctable = !transaction.isVoided && ["DEBT_PAYMENT", "LOAN_DISBURSEMENT", "BALANCE_ADJUSTMENT"].includes(transaction.type);
  const fixButton = correctable ? (
    <>
      <Button variant="outline" onClick={() => setFixOpen(true)}>
        <Pencil /> {transaction.type === "LOAN_DISBURSEMENT" ? "Изменить" : "Изменить дату"}
      </Button>
      <CorrectionDialog key={String(fixOpen)} transaction={transaction} accounts={accounts} open={fixOpen} onOpenChange={setFixOpen} />
    </>
  ) : null;

  if (transaction.isVoided || transaction.type === "DEBT_PAYMENT" || transaction.type === "LOAN_DISBURSEMENT") {
    return correctable ? (
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">{fixButton}</div>
        {transaction.type === "DEBT_PAYMENT" ? (
          <p className="text-[13px] text-muted-foreground">Чтобы изменить сумму или отменить платёж по долгу — вкладка «Платежи» этого долга: тогда восстановятся и остаток, и график.</p>
        ) : null}
      </div>
    ) : null;
  }

  const confirmIncome = () =>
    startTransition(async () => {
      const result = await confirmIncomeAction(transaction.id);
      if (!result.ok) return void toastActionError(result);
      toast.success("Доход подтверждён, баланс обновлён");
      router.refresh();
    });

  const doVoid = () =>
    startTransition(async () => {
      const result = await voidTransactionAction({ id: transaction.id, reason });
      if (!result.ok) return void toastActionError(result);
      toast.success("Операция аннулирована");
      setVoidOpen(false);
      router.push("/transactions");
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {fixButton}
      {transaction.status === "EXPECTED" ? (
        <Button onClick={confirmIncome} disabled={pending}>
          <CheckCircle2 /> Деньги получены
        </Button>
      ) : null}
      <Button variant="outline" className="text-danger" onClick={() => setVoidOpen(true)}>
        <Trash2 /> Аннулировать
      </Button>
      <ResponsiveDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={transaction.type === "TRANSFER" ? "Аннулировать перевод?" : "Аннулировать операцию?"}
        description={
          transaction.type === "TRANSFER"
            ? "Обе части перевода аннулируются, балансы обоих счетов восстановятся. Запись останется в истории."
            : "Влияние на баланс отменится. Запись останется в истории с пометкой «аннулирована»."
        }
      >
        <div className="grid gap-4">
          <Field label="Причина" htmlFor="void-reason" hint="Необязательно, для вашей истории.">
            <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </Field>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={doVoid} disabled={pending}>
              {pending ? "Аннулируем…" : "Аннулировать"}
            </Button>
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
