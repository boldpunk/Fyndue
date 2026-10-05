"use client";
import { Archive, ArchiveRestore, ArrowDownLeft, Pencil, RotateCcw, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { adjustBalanceAction, archiveAccountAction, restartTrackingAction } from "@/app/(app)/accounts/actions";
import { Money } from "@/components/finance/money";
import { MoneyInput } from "@/components/finance/money-input";
import { useQuickAdd } from "@/components/layout/quick-add";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { ConversionFields, type ConversionValues } from "@/components/transactions/conversion-fields";
import type { AccountOption } from "@/components/transactions/types";
import { Switch } from "@/components/ui/switch";
import { money, parseMoneyInput, toMoneyString } from "@/lib/finance/money";
import type { AccountDTO } from "@/lib/services/accounts";
import { balanceAdjustmentSchema } from "@/lib/validations/accounts";

function RestartTrackingForm({ account, today, onDone }: { account: AccountDTO; today: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actual, setActual] = useState(account.currentBalance.replace(/\.00$/, ""));
  const [startDate, setStartDate] = useState(account.trackingStartDate ?? today);
  const [removeAdjustments, setRemoveAdjustments] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = () =>
    startTransition(async () => {
      setErrors({});
      const result = await restartTrackingAction({ accountId: account.id, actualBalance: actual, startDate, removeAdjustments });
      if (!result.ok) return setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
      toast.success(result.data.voided ? `Готово: убрано операций — ${result.data.voided}, баланс совпадает с банком` : "Готово: баланс совпадает с банком");
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
        Для чистого старта: укажите, сколько на счёте сейчас по данным банка и с какого дня вы ведёте учёт. Корректировки и операции до этого дня уберутся,
        настоящие расходы и доходы после него останутся, а начальный баланс пересчитается так, чтобы итог совпал с банком.
      </p>
      <Field label="Сколько на счёте сейчас" htmlFor="restart-actual" error={errors.actualBalance}>
        <MoneyInput id="restart-actual" currency={account.currency} allowNegative autoFocus value={actual} onChange={setActual} />
      </Field>
      <Field label="Веду учёт с" htmlFor="restart-start" error={errors.startDate} hint="Операции раньше этой даты больше нельзя будет добавить: те деньги уже в начальном балансе.">
        <Input id="restart-start" type="date" value={startDate} max={today} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Убрать все корректировки</span>
          <span className="text-[13px] text-muted-foreground">Ручные подгонки баланса больше не нужны — итог задаётся суммой выше.</span>
        </span>
        <Switch checked={removeAdjustments} onCheckedChange={setRemoveAdjustments} aria-label="Убрать все корректировки" />
      </label>
      {errors.form ? (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Сохраняем…" : "Начать учёт заново"}
      </Button>
    </form>
  );
}

type AdjustExtras = { otherAccounts: AccountOption[]; fxRates: Record<string, string> };

function AdjustBalanceForm({ account, today, onDone, otherAccounts, fxRates }: { account: AccountDTO; today: string; onDone: () => void } & AdjustExtras) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [isConversion, setIsConversion] = useState(false);
  const preferred = otherAccounts.find((a) => a.currency !== account.currency) ?? otherAccounts[0];
  const [conversion, setConversion] = useState<ConversionValues>({ counterpartAccountId: preferred?.id ?? "", counterpartAmount: "" });
  const [conversionErrors, setConversionErrors] = useState<Record<string, string>>({});
  const { control, register, handleSubmit, setError, formState } = useForm({
    defaultValues: { targetBalance: account.currentBalance.replace(/\.00$/, ""), date: today, note: "" },
  });
  const target = parseMoneyInput(useWatch({ control, name: "targetBalance" }) ?? "");
  const delta = target ? target.minus(money(account.currentBalance)) : null;
  const onSubmit = handleSubmit((values) => {
    const payload = { ...values, accountId: account.id, ...(isConversion ? conversion : {}) };
    const parsed = balanceAdjustmentSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) setError(issue.path[0] as "targetBalance", { message: issue.message });
      return;
    }
    startTransition(async () => {
      setConversionErrors({});
      const result = await adjustBalanceAction(payload);
      if (!result.ok) {
        const fe = result.fieldErrors ?? {};
        setConversionErrors({ counterpartAmount: fe.counterpartAmount ?? fe.toAmount ?? fe.amount ?? "", counterpartAccountId: fe.counterpartAccountId ?? "" });
        return setFormError(result.error);
      }
      toast.success(result.data.transactionId ? (isConversion ? "Конвертация записана" : "Баланс скорректирован") : "Баланс уже совпадает");
      router.refresh();
      onDone();
    });
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Баланс в Fyndue: <Money amount={account.currentBalance} currency={account.currency} className="font-medium text-foreground" />.
        Введите сумму, которую на самом деле показывает банк или кошелёк, — разница запишется как {isConversion ? "конвертация" : "корректировка"}.
      </p>
      <Field label="Фактический баланс" htmlFor="targetBalance" error={formState.errors.targetBalance?.message}>
        <Controller control={control} name="targetBalance" render={({ field }) => <MoneyInput id="targetBalance" currency={account.currency} allowNegative autoFocus {...field} />} />
      </Field>
      {otherAccounts.length ? (
        <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Это обмен или перевод с другого счёта</span>
            <span className="text-[13px] text-muted-foreground">Например, купили доллары за сумы. Запишется как конвертация, а не корректировка.</span>
          </span>
          <Switch checked={isConversion} onCheckedChange={setIsConversion} aria-label="Это обмен или перевод с другого счёта" />
        </label>
      ) : null}
      {isConversion && delta && !delta.isZero() ? (
        <ConversionFields
          accounts={otherAccounts}
          currency={account.currency}
          amount={toMoneyString(delta.abs())}
          direction={delta.gt(0) ? "IN" : "OUT"}
          fxRates={fxRates}
          value={conversion}
          onChange={setConversion}
          errors={conversionErrors}
        />
      ) : null}
      <Field label="Дата" htmlFor="adj-date" error={formState.errors.date?.message}>
        <Input id="adj-date" type="date" {...register("date")} />
      </Field>
      <Field label="Комментарий" htmlFor="adj-note">
        <Input id="adj-note" placeholder="Необязательно" {...register("note")} />
      </Field>
      {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Сохраняем…" : isConversion ? "Записать конвертацию" : "Записать корректировку"}</Button>
    </form>
  );
}

export function AccountActions({
  account,
  today,
  otherAccounts = [],
  fxRates = {},
  incomeCategoryId,
}: { account: AccountDTO; today: string; incomeCategoryId?: string } & Partial<AdjustExtras>) {
  const quickAdd = useQuickAdd();
  const router = useRouter();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
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
          <Button onClick={() => quickAdd.open("INCOME", { accountId: account.id, categoryId: incomeCategoryId })}>
            <ArrowDownLeft /> Пополнить
          </Button>
          <Button variant="outline" onClick={() => setAdjustOpen(true)}>
            <Scale /> Скорректировать баланс
          </Button>
          <Button variant="outline" onClick={() => setRestartOpen(true)}>
            <RotateCcw /> Начать учёт заново
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
      <ResponsiveDialog open={restartOpen} onOpenChange={setRestartOpen} title="Начать учёт заново">
        <RestartTrackingForm account={account} today={today} onDone={() => setRestartOpen(false)} />
      </ResponsiveDialog>
      <ResponsiveDialog open={adjustOpen} onOpenChange={setAdjustOpen} title="Корректировка баланса">
        <AdjustBalanceForm account={account} today={today} otherAccounts={otherAccounts} fxRates={fxRates} onDone={() => setAdjustOpen(false)} />
      </ResponsiveDialog>
    </div>
  );
}
