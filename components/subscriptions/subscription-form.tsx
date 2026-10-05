"use client";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveRecurringAction } from "@/app/(app)/planning-actions";
import { MoneyInput } from "@/components/finance/money-input";
import type { AccountOption, CategoryOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SUBSCRIPTION_PRESETS, type SubscriptionPreset } from "@/lib/constants/subscriptions";
import { convertViaUzs } from "@/lib/finance/fx";
import { formatMoney, parseMoneyInput, toMoneyString } from "@/lib/finance/money";
import { describeRule, type RecurrenceFrequency } from "@/lib/finance/recurrence";
import type { RecurringDTO } from "@/lib/services/recurring";
import { SubscriptionAvatar } from "./subscription-avatar";
import { offerPro } from "@/lib/utils/action-toast";

/** The billing periods offered first; any other saved period is added to the list. */
const PERIODS: { frequency: RecurrenceFrequency; interval: number }[] = [
  { frequency: "MONTHLY", interval: 1 },
  { frequency: "MONTHLY", interval: 3 },
  { frequency: "MONTHLY", interval: 6 },
  { frequency: "YEARLY", interval: 1 },
  { frequency: "WEEKLY", interval: 1 },
];
const periodKey = (p: { frequency: string; interval: number }) => `${p.frequency}:${p.interval}`;

/** Step 1 for a new subscription: pick a popular service or start blank. */
export function PresetPicker({ onPick }: { onPick: (preset: SubscriptionPreset | null) => void }) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Выберите сервис — название и ссылка заполнятся сами, цену введёте вы.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SUBSCRIPTION_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPick(p)}
            className="flex min-w-0 items-center gap-2.5 rounded-lg border bg-card p-2.5 text-left text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary-subtle/40"
          >
            <SubscriptionAvatar name={p.name} className="size-8 rounded-lg text-xs" />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick(null)}
          className="flex min-w-0 items-center gap-2.5 rounded-lg border border-dashed p-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
            <Plus className="size-4" aria-hidden />
          </span>
          <span className="truncate">Другая</span>
        </button>
      </div>
    </div>
  );
}

export function SubscriptionForm({
  item,
  preset,
  accounts,
  categories,
  defaultCategoryId,
  fxRates,
  baseCurrency,
  today,
  onDone,
}: {
  item?: RecurringDTO;
  preset?: SubscriptionPreset | null;
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultCategoryId: string;
  fxRates: Record<string, string>;
  baseCurrency: string;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A foreign-currency card first suggests itself for the well-known foreign services.
  const foreignAccount = accounts.find((a) => a.currency !== baseCurrency);
  const [v, setValues] = useState({
    name: item?.name ?? preset?.name ?? "",
    amount: item ? formatMoney(item.amount, "", { hideCurrency: true }) : "",
    accountId: item?.account.id ?? (preset?.foreign && foreignAccount ? foreignAccount.id : accounts[0]?.id) ?? "",
    categoryId: item?.category?.id ?? categories.find((c) => c.type === "EXPENSE" && c.name === preset?.category)?.id ?? defaultCategoryId,
    period: periodKey(item ?? { frequency: preset?.frequency ?? "MONTHLY", interval: 1 }),
    startDate: item?.startDate ?? today,
    url: item?.url ?? preset?.url ?? "",
    note: item?.note ?? "",
  });
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setValues((s) => ({ ...s, [key]: value }));
  const account = accounts.find((a) => a.id === v.accountId);
  const periods = PERIODS.some((p) => periodKey(p) === v.period) ? PERIODS : [...PERIODS, { frequency: item!.frequency, interval: item!.interval }];
  const [frequency, interval] = v.period.split(":") as [RecurrenceFrequency, string];

  const parsed = parseMoneyInput(v.amount);
  const inBase = account && account.currency !== baseCurrency && parsed ? convertViaUzs(toMoneyString(parsed), account.currency, baseCurrency, fxRates) : null;

  const save = () =>
    startTransition(async () => {
      setErrors({});
      const result = await saveRecurringAction({
        ...(item ? { id: item.id } : {}),
        name: v.name,
        kind: "EXPENSE",
        amount: v.amount,
        accountId: v.accountId,
        categoryId: v.categoryId,
        frequency,
        interval,
        startDate: v.startDate,
        endDate: item?.endDate ?? "",
        isSubscription: true,
        url: v.url,
        note: v.note,
      });
      if (!result.ok) {
        offerPro(result);
        return setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
      }
      toast.success(item ? "Подписка обновлена" : `«${v.name}» добавлена`);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" htmlFor="sub-name" error={errors.name}>
          <Input id="sub-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="например, Кинопоиск" autoFocus={!item && !preset} />
        </Field>
        <Field
          label="Цена"
          htmlFor="sub-amount"
          error={errors.amount}
          hint={inBase ? `≈ ${formatMoney(toMoneyString(inBase), baseCurrency)} по курсу ЦБ` : undefined}
        >
          <MoneyInput id="sub-amount" currency={account?.currency} value={v.amount} onChange={(x) => set("amount", x)} autoFocus={!item && Boolean(preset)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="С какой карты" htmlFor="sub-account" error={errors.accountId} hint="Цена вводится в валюте этой карты: для долларовой — в $.">
          <NativeSelect id="sub-account" value={v.accountId} onChange={(e) => set("accountId", e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Как часто" htmlFor="sub-period" error={errors.interval ?? errors.frequency}>
          <NativeSelect id="sub-period" value={v.period} onChange={(e) => set("period", e.target.value)}>
            {periods.map((p) => (
              <option key={periodKey(p)} value={periodKey(p)}>
                {describeRule(p)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={item ? "Первое списание" : "Дата списания"}
          htmlFor="sub-start"
          error={errors.startDate}
          hint={item ? "От этой даты считаются все следующие." : "Ближайшее списание. Дальше — в тот же день каждого периода."}
        >
          <Input id="sub-start" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="Категория" htmlFor="sub-category" error={errors.categoryId}>
          <NativeSelect id="sub-category" value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {v.categoryId ? null : <option value="">Выберите категорию</option>}
            {categories
              .filter((c) => c.type === "EXPENSE")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Где управлять или отменить" htmlFor="sub-url" error={errors.url} hint="Необязательно. Ссылка откроется из списка подписок.">
        <Input id="sub-url" inputMode="url" autoComplete="off" value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="например, chatgpt.com" />
      </Field>
      <Field label="Заметка" htmlFor="sub-note" error={errors.note}>
        <Textarea id="sub-note" rows={2} value={v.note} onChange={(e) => set("note", e.target.value)} placeholder="Необязательно — аккаунт, тариф, промокод…" />
      </Field>
      {errors.form ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {errors.form}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Сохраняем…" : item ? "Сохранить" : "Добавить подписку"}
      </Button>
    </form>
  );
}
