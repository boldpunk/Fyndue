"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  createTransactionAction,
  updateCashFlowTransactionAction,
  updateTransferAction,
} from "@/app/(app)/transactions/actions";
import { MoneyInput } from "@/components/finance/money-input";
import { Money } from "@/components/finance/money";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { TransactionDTO } from "@/lib/services/transactions";
import type { ActionResult } from "@/lib/utils/action-result";
import {
  cashFlowUpdateSchema,
  transactionCreateSchema,
  transferUpdateSchema,
} from "@/lib/validations/transactions";
import type { ZodType } from "zod";
import { CategoryPicker } from "./category-picker";
import type { AccountOption, CategoryOption } from "./types";
import { formatMoney, parseMoneyInput, toMoneyString } from "@/lib/finance/money";
import { convertViaUzs } from "@/lib/finance/fx";

export type TransactionKind = "EXPENSE" | "INCOME" | "TRANSFER";

type FormValues = {
  accountId: string;
  toAccountId: string;
  categoryId: string;
  amount: string;
  toAmount: string;
  date: string;
  merchant: string;
  note: string;
  expected: boolean;
};

const KIND_OPTIONS = [
  { value: "EXPENSE", label: "Расход" },
  { value: "INCOME", label: "Доход" },
  { value: "TRANSFER", label: "Перевод" },
] as const;

function groupAmount(amount: string) {
  return amount.replace(/\.00$/, "");
}

export function TransactionForm({
  accounts,
  categories,
  today,
  defaultKind = "EXPENSE",
  defaultAccountId,
  defaultCategoryId,
  initial,
  onDone,
  fxRates = {},
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  today: string;
  defaultKind?: TransactionKind;
  defaultAccountId?: string;
  defaultCategoryId?: string;
  initial?: TransactionDTO;
  onDone?: () => void;
  /** Latest Central Bank rates, UZS per 1 unit, to suggest the amount received in a transfer. */
  fxRates?: Record<string, string>;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [kind, setKind] = useState<TransactionKind>((initial?.type as TransactionKind | undefined) ?? defaultKind);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const firstAccount = (defaultAccountId && accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : accounts[0]?.id) ?? "";
  const form = useForm<FormValues>({
    defaultValues: initial
      ? {
          accountId: initial.account.id,
          toAccountId: initial.counterpart?.accountId ?? "",
          categoryId: initial.category?.id ?? "",
          amount: groupAmount(initial.amount),
          toAmount: initial.counterpart ? groupAmount(initial.counterpart.amount) : "",
          date: initial.date,
          merchant: initial.merchant ?? "",
          note: initial.note ?? "",
          expected: initial.status === "EXPECTED",
        }
      : {
          accountId: firstAccount,
          toAccountId: accounts.find((a) => a.id !== firstAccount)?.id ?? "",
          categoryId: defaultCategoryId ?? "",
          amount: "",
          toAmount: "",
          date: today,
          merchant: "",
          note: "",
          expected: false,
        },
  });
  const { register, control, handleSubmit, setError, clearErrors, reset, formState, setValue } = form;
  const errors = formState.errors;

  const accountId = useWatch({ control, name: "accountId" });
  const toAccountId = useWatch({ control, name: "toAccountId" });
  const fromAccount = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const crossCurrency = kind === "TRANSFER" && fromAccount && toAccount && fromAccount.currency !== toAccount.currency;
  const sentAmount = useWatch({ control, name: "amount" });
  const parsedSent = crossCurrency ? parseMoneyInput(sentAmount ?? "") : null;
  const suggestion =
    crossCurrency && parsedSent && parsedSent.gt(0) ? convertViaUzs(parsedSent, fromAccount.currency, toAccount.currency, fxRates) : null;
  const kindCategories = useMemo(
    () => categories.filter((c) => c.type === (kind === "INCOME" ? "INCOME" : "EXPENSE")),
    [categories, kind],
  );

  const applyErrors = (fieldErrors: Record<string, string> | undefined) => {
    for (const [key, message] of Object.entries(fieldErrors ?? {})) {
      const field = key === "fromAccountId" ? "accountId" : key;
      if (field in form.getValues()) setError(field as keyof FormValues, { message });
    }
  };

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    clearErrors();
    const common = { amount: values.amount, date: values.date, note: values.note };

    let schema: ZodType;
    let payload: Record<string, unknown>;
    let action: (input: unknown) => Promise<ActionResult<unknown>>;

    if (editing && initial) {
      if (kind === "TRANSFER") {
        schema = transferUpdateSchema;
        payload = { id: initial.id, ...common, toAmount: crossCurrency ? values.toAmount : undefined };
        action = updateTransferAction;
      } else {
        schema = cashFlowUpdateSchema;
        payload = {
          id: initial.id,
          ...common,
          accountId: values.accountId,
          categoryId: values.categoryId,
          merchant: values.merchant,
          ...(kind === "INCOME" ? { status: values.expected ? "EXPECTED" : "ACTUAL" } : {}),
        };
        action = updateCashFlowTransactionAction;
      }
    } else {
      schema = transactionCreateSchema;
      action = createTransactionAction;
      payload =
        kind === "TRANSFER"
          ? {
              kind,
              clientRequestId: requestId,
              ...common,
              fromAccountId: values.accountId,
              toAccountId: values.toAccountId,
              toAmount: crossCurrency ? values.toAmount : undefined,
            }
          : {
              kind,
              clientRequestId: requestId,
              ...common,
              accountId: values.accountId,
              categoryId: values.categoryId,
              merchant: values.merchant,
              ...(kind === "INCOME" ? { status: values.expected ? "EXPECTED" : "ACTUAL" } : {}),
            };
    }

    // Same schema as the server: instant feedback, then authoritative re-check there.
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        applyErrors({ [key]: issue.message });
      }
      return;
    }

    startTransition(async () => {
      const result = await action(payload);
      if (!result.ok) {
        setFormError(result.error);
        applyErrors(result.fieldErrors);
        return;
      }
      toast.success(editing ? "Операция обновлена" : kind === "TRANSFER" ? "Перевод записан" : kind === "INCOME" ? "Доход записан" : "Расход записан");
      if (!editing) {
        reset({ ...values, amount: "", toAmount: "", merchant: "", note: "", categoryId: "" });
        setRequestId(crypto.randomUUID());
      }
      router.refresh();
      onDone?.();
    });
  });

  if (accounts.length === 0) {
    return (
      <div className="grid gap-3 text-sm">
        <p className="text-muted-foreground">Сначала создайте счёт: каждая операция привязана к счёту.</p>
        <Button onClick={() => { onDone?.(); router.push("/accounts/new"); }}>Создать счёт</Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {!editing ? (
        <Segmented
          label="Тип операции"
          value={kind}
          onChange={(value) => {
            setKind(value);
            form.setValue("categoryId", "");
            clearErrors();
          }}
          options={KIND_OPTIONS}
        />
      ) : null}

      <Field label="Сумма" htmlFor="amount" error={errors.amount?.message}>
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <MoneyInput
              id="amount"
              size="lg"
              autoFocus={!editing}
              placeholder="0"
              currency={fromAccount?.currency}
              aria-invalid={Boolean(errors.amount) || undefined}
              aria-describedby={errors.amount ? "amount-error" : undefined}
              {...field}
            />
          )}
        />
      </Field>

      {kind !== "TRANSFER" ? (
        <Field label="Категория" htmlFor="categoryId" error={errors.categoryId?.message}>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <CategoryPicker
                categories={kindCategories}
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.categoryId)}
                describedBy={errors.categoryId ? "categoryId-error" : undefined}
              />
            )}
          />
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === "TRANSFER" ? "Со счёта" : "Счёт"} htmlFor="accountId" error={errors.accountId?.message}>
          <NativeSelect id="accountId" disabled={editing && kind === "TRANSFER"} {...register("accountId")}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {kind === "TRANSFER" ? (
          <Field label="На счёт" htmlFor="toAccountId" error={errors.toAccountId?.message}>
            <NativeSelect id="toAccountId" disabled={editing} {...register("toAccountId")}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <Field label="Дата" htmlFor="date" error={errors.date?.message}>
            <Input id="date" type="date" {...register("date")} />
          </Field>
        )}
      </div>

      {crossCurrency ? (
        <Field
          label={`Зачислено в ${toAccount?.currency}`}
          htmlFor="toAmount"
          error={errors.toAmount?.message}
          hint={
            suggestion ? (
              <>
                По курсу ЦБ ≈ <Money amount={toMoneyString(suggestion)} currency={toAccount.currency} />.{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => setValue("toAmount", formatMoney(suggestion, toAccount.currency, { hideCurrency: true }), { shouldValidate: true })}
                >
                  Подставить
                </button>{" "}
                Банк может пересчитать по своему курсу — укажите, сколько пришло на самом деле.
              </>
            ) : (
              "Валюты разные: укажите, сколько пришло на самом деле."
            )
          }
        >
          <Controller
            control={control}
            name="toAmount"
            render={({ field }) => <MoneyInput id="toAmount" currency={toAccount?.currency} placeholder="0" {...field} />}
          />
        </Field>
      ) : null}

      {kind === "TRANSFER" ? (
        <Field label="Дата" htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" {...register("date")} />
        </Field>
      ) : (
        <Field label="Где / у кого" htmlFor="merchant" error={errors.merchant?.message}>
          <Input id="merchant" placeholder="Необязательно" autoComplete="off" {...register("merchant")} />
        </Field>
      )}

      <Field label="Комментарий" htmlFor="note" error={errors.note?.message}>
        <Textarea id="note" rows={2} placeholder="Необязательно" {...register("note")} />
      </Field>

      {kind === "INCOME" ? (
        <Controller
          control={control}
          name="expected"
          render={({ field }) => (
            <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">Ожидается, ещё не получен</span>
                <span className="text-[13px] text-muted-foreground">Не изменит баланс, пока вы не подтвердите получение.</span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Ожидаемый доход" />
            </label>
          )}
        />
      ) : null}

      {fromAccount && !editing ? (
        <p className="text-[13px] text-muted-foreground">
          Баланс {fromAccount.name}: <Money amount={fromAccount.currentBalance} currency={fromAccount.currency} />
        </p>
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Сохраняем…" : editing ? "Сохранить изменения" : "Сохранить"}
      </Button>
    </form>
  );
}
