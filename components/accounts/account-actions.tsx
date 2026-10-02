"use client";
import { Archive, ArchiveRestore, Pencil, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { adjustBalanceAction, archiveAccountAction } from "@/app/(app)/accounts/actions";
import { Money } from "@/components/finance/money";
import { MoneyInput } from "@/components/finance/money-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { AccountDTO } from "@/lib/services/accounts";
import { balanceAdjustmentSchema } from "@/lib/validations/accounts";

function AdjustBalanceForm({ account, today, onDone }: { account: AccountDTO; today: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, register, handleSubmit, setError, formState } = useForm({
    defaultValues: { targetBalance: account.currentBalance.replace(/\.00$/, ""), date: today, note: "" },
  });
  const onSubmit = handleSubmit((values) => {
    const payload = { ...values, accountId: account.id };
    const parsed = balanceAdjustmentSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) setError(issue.path[0] as "targetBalance", { message: issue.message });
      return;
    }
    startTransition(async () => {
      const result = await adjustBalanceAction(payload);
      if (!result.ok) return setFormError(result.error);
      toast.success(result.data.transactionId ? "Баланс скорректирован" : "Баланс уже совпадает");
      router.refresh();
      onDone();
    });
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Баланс в Fyndue: <Money amount={account.currentBalance} currency={account.currency} className="font-medium text-foreground" />.
        Введите сумму, которую на самом деле показывает банк или кошелёк, — разница запишется как корректировка.
      </p>
      <Field label="Фактический баланс" htmlFor="targetBalance" error={formState.errors.targetBalance?.message}>
        <Controller control={control} name="targetBalance" render={({ field }) => <MoneyInput id="targetBalance" currency={account.currency} allowNegative autoFocus {...field} />} />
      </Field>
      <Field label="Дата" htmlFor="adj-date" error={formState.errors.date?.message}>
        <Input id="adj-date" type="date" {...register("date")} />
      </Field>
      <Field label="Комментарий" htmlFor="adj-note">
        <Input id="adj-note" placeholder="Необязательно" {...register("note")} />
      </Field>
      {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Записать корректировку"}</Button>
    </form>
  );
}

export function AccountActions({ account, today }: { account: AccountDTO; today: string }) {
  const router = useRouter();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggleArchive = () =>
    startTransition(async () => {
      const result = await archiveAccountAction({ id: account.id, archived: !account.isArchived });
      if (!result.ok) return void toast.error(result.error);
      toast.success(account.isArchived ? "Счёт восстановлен" : "Счёт перенесён в архив");
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {!account.isArchived ? (
        <>
          <Button variant="outline" onClick={() => setAdjustOpen(true)}>
            <Scale /> Скорректировать баланс
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/accounts/${account.id}/edit`}>
              <Pencil /> Изменить
            </Link>
          </Button>
        </>
      ) : null}
      <Button variant="ghost" disabled={pending} onClick={toggleArchive}>
        {account.isArchived ? <ArchiveRestore /> : <Archive />}
        {account.isArchived ? "Восстановить" : "В архив"}
      </Button>
      <ResponsiveDialog open={adjustOpen} onOpenChange={setAdjustOpen} title="Корректировка баланса">
        <AdjustBalanceForm account={account} today={today} onDone={() => setAdjustOpen(false)} />
      </ResponsiveDialog>
    </div>
  );
}
