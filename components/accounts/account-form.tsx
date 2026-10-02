"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { createAccountAction, updateAccountAction } from "@/app/(app)/accounts/actions";
import { ColorPicker } from "@/components/finance/color-picker";
import { MoneyInput } from "@/components/finance/money-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, CURRENCIES, CURRENCY_LABELS } from "@/lib/constants/finance";
import type { AccountDTO } from "@/lib/services/accounts";
import { accountCreateSchema, accountUpdateSchema } from "@/lib/validations/accounts";

type Values = {
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  currency: (typeof CURRENCIES)[number];
  openingBalance: string;
  bank: string;
  includeInTotal: boolean;
  color: string | undefined;
};

export function AccountForm({ account, defaultCurrency }: { account?: AccountDTO; defaultCurrency: Values["currency"] }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { register, control, handleSubmit, setError, formState } = useForm<Values>({
    defaultValues: account
      ? {
          name: account.name,
          type: account.type,
          currency: account.currency,
          openingBalance: account.openingBalance.replace(/\.00$/, ""),
          bank: account.bank ?? "",
          includeInTotal: account.includeInTotal,
          color: account.color ?? undefined,
        }
      : { name: "", type: "BANK_CARD", currency: defaultCurrency, openingBalance: "0", bank: "", includeInTotal: true, color: "indigo" },
  });
  const errors = formState.errors;
  const currency = useWatch({ control, name: "currency" });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const payload = account ? { ...values, id: account.id, currency: undefined } : values;
    const parsed = (account ? accountUpdateSchema : accountCreateSchema).safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) setError(issue.path[0] as keyof Values, { message: issue.message });
      return;
    }
    startTransition(async () => {
      const result = account ? await updateAccountAction(payload) : await createAccountAction(payload);
      if (!result.ok) {
        setFormError(result.error);
        for (const [key, message] of Object.entries(result.fieldErrors ?? {})) setError(key as keyof Values, { message });
        return;
      }
      toast.success(account ? "Счёт обновлён" : "Счёт создан");
      router.push(`/accounts/${result.data.id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <Field label="Название" htmlFor="name" error={errors.name?.message}>
        <Input id="name" placeholder="например Uzcard, Наличные" autoFocus={!account} {...register("name")} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Тип" htmlFor="type" error={errors.type?.message}>
          <NativeSelect id="type" {...register("type")}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Валюта"
          htmlFor="currency"
          error={errors.currency?.message}
          hint={account ? "Валюту нельзя изменить после создания." : undefined}
        >
          <NativeSelect id="currency" disabled={Boolean(account)} {...register("currency")}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} — {CURRENCY_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field
        label="Начальный баланс"
        htmlFor="openingBalance"
        error={errors.openingBalance?.message}
        hint={account ? "Если изменить, текущий баланс сдвинется на ту же разницу." : "Сколько было на счёте, когда вы начали его вести."}
      >
        <Controller
          control={control}
          name="openingBalance"
          render={({ field }) => <MoneyInput id="openingBalance" currency={currency} allowNegative {...field} />}
        />
      </Field>

      <Field label="Банк" htmlFor="bank" error={errors.bank?.message}>
        <Input id="bank" placeholder="Необязательно" {...register("bank")} />
      </Field>

      <Field label="Цвет" htmlFor="color">
        <Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
      </Field>

      <Controller
        control={control}
        name="includeInTotal"
        render={({ field }) => (
          <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Учитывать в общем балансе</span>
              <span className="text-[13px] text-muted-foreground">Выключите для денег, которые не нужно считать доступными.</span>
            </span>
            <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Учитывать в общем балансе" />
          </label>
        )}
      />

      {formError ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняем…" : account ? "Сохранить" : "Создать счёт"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
