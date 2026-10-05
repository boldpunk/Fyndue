"use client";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  createTransactionAction,
  updateCashFlowTransactionAction,
  updateTransferAction,
} from "@/app/(app)/transactions/actions";
import { CategoryEditor } from "@/components/categories/category-manager";
import { MoneyInput } from "@/components/finance/money-input";
import { Money } from "@/components/finance/money";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { MerchantMemory, TransactionDTO } from "@/lib/services/transactions";
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
import { parseQuickEntry } from "@/lib/finance/quick-entry";
import { Sparkles, Star } from "lucide-react";
import { createTemplateAction } from "@/app/(app)/transactions/template-actions";
import { CategoryIcon } from "@/components/finance/category-icon";
import type { TemplateDTO } from "@/lib/services/templates";
import { offerPro, toastActionError } from "@/lib/utils/action-toast";

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
  merchants = [],
  templates,
  createAction = createTransactionAction,
  kinds = ["EXPENSE", "INCOME", "TRANSFER"],
  canSaveTemplates = true,
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
  /** Places/people typed before, with their last category: suggested and auto-categorised. */
  merchants?: MerchantMemory[];
  /** Saved operations shown as one-tap chips; also enables «Запомнить как шаблон». */
  templates?: TemplateDTO[];
  /** Shared accounts write through their own action (lib/services/shared-accounts.ts). */
  createAction?: (input: unknown) => Promise<ActionResult<unknown>>;
  kinds?: TransactionKind[];
  /** Saving new templates is a Pro feature. */
  canSaveTemplates?: boolean;
}) {
  const router = useRouter();
  const merchantListId = useId();
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  // The category the merchant filled in; replaced on the next match, never a hand-picked one.
  const [autoCategory, setAutoCategory] = useState<string | null>(null);
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

  const kindMerchants = useMemo(() => (kind === "TRANSFER" ? [] : merchants.filter((m) => m.type === kind)), [merchants, kind]);
  const fillCategoryFromMerchant = (typed: string) => {
    const key = typed.trim().toLowerCase();
    const match = key ? kindMerchants.find((m) => m.merchant.trim().toLowerCase() === key) : undefined;
    if (!match || !kindCategories.some((c) => c.id === match.categoryId)) return;
    const current = form.getValues("categoryId");
    if (current && current !== autoCategory) return;
    setAutoCategory(match.categoryId);
    form.setValue("categoryId", match.categoryId, { shouldValidate: Boolean(errors.categoryId) });
  };

  /** «кофе 25к starbucks» → fills amount, category, place and account. */
  const applyQuickEntry = (text: string) => {
    setQuickText(text);
    const parsed = parseQuickEntry(text, { categories, accounts, merchants });
    if (parsed.kind && parsed.kind !== kind) setKind(parsed.kind);
    form.setValue("amount", parsed.amount ? formatMoney(parsed.amount, "", { hideCurrency: true }) : "");
    form.setValue("categoryId", parsed.categoryId ?? "");
    form.setValue("merchant", parsed.merchant ?? "");
    if (parsed.accountId) form.setValue("accountId", parsed.accountId);
    setAutoCategory(null);
    clearErrors();
  };

  const applyTemplate = (t: TemplateDTO) => {
    setQuickText("");
    if (t.kind !== kind) setKind(t.kind);
    if (t.accountId && accounts.some((a) => a.id === t.accountId)) form.setValue("accountId", t.accountId);
    form.setValue("categoryId", t.categoryId);
    form.setValue("amount", t.amount ? formatMoney(t.amount, "", { hideCurrency: true }) : "");
    form.setValue("merchant", t.merchant ?? "");
    form.setValue("note", t.note ?? "");
    setAutoCategory(null);
    clearErrors();
    if (!t.amount) document.getElementById("amount")?.focus();
  };

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
      action = createAction;
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
        offerPro(result);
        setFormError(result.error);
        applyErrors(result.fieldErrors);
        return;
      }
      const createdId = !editing && createAction === createTransactionAction ? (result.data as { id?: string } | null)?.id : undefined;
      toast.success(
        editing ? "Операция обновлена" : kind === "TRANSFER" ? "Перевод записан" : kind === "INCOME" ? "Доход записан" : "Расход записан",
        createdId && kind !== "TRANSFER" ? { action: { label: "Прикрепить чек", onClick: () => router.push(`/transactions/${createdId}`) } } : undefined,
      );
      if (!editing && saveAsTemplate && kind !== "TRANSFER") {
        const name = values.merchant.trim() || categories.find((c) => c.id === values.categoryId)?.name || "Шаблон";
        const saved = await createTemplateAction({
          name: name.slice(0, 40),
          kind,
          accountId: values.accountId,
          categoryId: values.categoryId,
          amount: values.amount,
          merchant: values.merchant,
          note: values.note,
        });
        if (saved.ok) toast.success(`Шаблон «${name.slice(0, 40)}» сохранён`);
        else toastActionError(saved);
        setSaveAsTemplate(false);
      }
      if (!editing) {
        reset({ ...values, amount: "", toAmount: "", merchant: "", note: "", categoryId: "" });
        setQuickText("");
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
          options={KIND_OPTIONS.filter((o) => kinds.includes(o.value))}
        />
      ) : null}

      {!editing && templates && templates.length > 0 ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Шаблоны">
          {templates.map((t) => {
            const category = categories.find((c) => c.id === t.categoryId);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card py-1 pr-3 pl-1 text-xs font-medium hover:border-primary hover:text-primary"
              >
                {category ? <CategoryIcon icon={category.icon} color={category.color} size="sm" /> : null}
                <span className="max-w-32 truncate">{t.name}</span>
                {t.amount ? <span className="tabular text-muted-foreground">{formatMoney(t.amount, "", { hideCurrency: true })}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {!editing && kind !== "TRANSFER" ? (
        <div className="grid gap-1.5">
          <label htmlFor="quick-entry" className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-3.5 text-primary" aria-hidden /> Быстрый ввод
          </label>
          <Input
            id="quick-entry"
            value={quickText}
            onChange={(e) => applyQuickEntry(e.target.value)}
            placeholder="кофе 25к starbucks · +3 млн зарплата"
            autoComplete="off"
            enterKeyHint="done"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Одной строкой — сумма, категория и место заполнятся сами. Или заполните поля ниже.</p>
        </div>
      ) : null}

      <Field label="Сумма" htmlFor="amount" error={errors.amount?.message}>
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <MoneyInput
              id="amount"
              size="lg"
              autoFocus={!editing && kind === "TRANSFER"}
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
                onChange={(id) => {
                  setAutoCategory(null);
                  field.onChange(id);
                }}
                invalid={Boolean(errors.categoryId)}
                describedBy={errors.categoryId ? "categoryId-error" : undefined}
                // Categories are the owner's on a shared account: no creating from there.
                onCreate={createAction === createTransactionAction ? () => setCreatingCategory(true) : undefined}
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
        <Field label={kind === "INCOME" ? "От кого" : "Где / у кого"} htmlFor="merchant" error={errors.merchant?.message}>
          <Input
            id="merchant"
            placeholder={kind === "INCOME" ? "Необязательно — например, Азиз или работодатель" : "Необязательно"}
            autoComplete="off"
            list={kindMerchants.length > 0 ? merchantListId : undefined}
            {...register("merchant", { onChange: (e) => fillCategoryFromMerchant(e.target.value) })}
          />
          {kindMerchants.length > 0 ? (
            <datalist id={merchantListId}>
              {kindMerchants.map((m) => (
                <option key={m.merchant} value={m.merchant} />
              ))}
            </datalist>
          ) : null}
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

      {!editing && templates && canSaveTemplates && kind !== "TRANSFER" ? (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
          <Star className="size-3.5" aria-hidden /> Запомнить как шаблон — потом одним нажатием
        </label>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Сохраняем…" : editing ? "Сохранить изменения" : "Сохранить"}
      </Button>
      {kind !== "TRANSFER" ? (
        <ResponsiveDialog open={creatingCategory} onOpenChange={setCreatingCategory} title={kind === "INCOME" ? "Новая категория дохода" : "Новая категория расхода"}>
          {creatingCategory ? (
            <CategoryEditor
              draft={{ name: "", icon: "circle-dashed", color: "indigo" }}
              type={kind}
              parents={kindCategories.filter((c) => !c.parentId).map(({ id, name }) => ({ id, name }))}
              onDone={(id) => {
                setCreatingCategory(false);
                if (id) {
                  setAutoCategory(null);
                  form.setValue("categoryId", id, { shouldValidate: true });
                }
              }}
            />
          ) : null}
        </ResponsiveDialog>
      ) : null}
    </form>
  );
}
