"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveRecurringAction } from "@/app/(app)/planning-actions";
import { MoneyInput } from "@/components/finance/money-input";
import { CategoryPicker } from "@/components/transactions/category-picker";
import type { AccountOption, CategoryOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/finance/money";
import type { RecurringDTO } from "@/lib/services/recurring";

type Kind = "EXPENSE" | "INCOME";
type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export function RecurringForm({
  item,
  accounts,
  categories,
  today,
  onDone,
}: {
  item?: RecurringDTO;
  accounts: AccountOption[];
  categories: CategoryOption[];
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setValues] = useState({
    name: item?.name ?? "",
    kind: (item?.kind ?? "EXPENSE") as Kind,
    amount: item ? formatMoney(item.amount, "", { hideCurrency: true }) : "",
    accountId: item?.account.id ?? accounts[0]?.id ?? "",
    categoryId: item?.category?.id ?? "",
    frequency: (item?.frequency ?? "MONTHLY") as Frequency,
    interval: String(item?.interval ?? 1),
    startDate: item?.startDate ?? today,
    endDate: item?.endDate ?? "",
    isSubscription: item?.isSubscription ?? false,
    note: item?.note ?? "",
  });
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setValues((s) => ({ ...s, [key]: value }));
  const currency = accounts.find((a) => a.id === v.accountId)?.currency;

  const save = () =>
    startTransition(async () => {
      setErrors({});
      const result = await saveRecurringAction({ ...(item ? { id: item.id } : {}), ...v, interval: v.interval });
      if (!result.ok) return setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
      toast.success(item ? "Recurring item updated" : "Recurring item added");
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
      <Segmented
        label="Type"
        value={v.kind}
        onChange={(kind) => setValues((s) => ({ ...s, kind, categoryId: "", isSubscription: kind === "INCOME" ? false : s.isSubscription }))}
        options={[
          { value: "EXPENSE", label: "Expense" },
          { value: "INCOME", label: "Income" },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="rec-name" error={errors.name}>
          <Input id="rec-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder={v.kind === "INCOME" ? "e.g. Salary" : "e.g. Internet"} autoFocus={!item} />
        </Field>
        <Field label="Amount" htmlFor="rec-amount" error={errors.amount}>
          <MoneyInput id="rec-amount" currency={currency} value={v.amount} onChange={(x) => set("amount", x)} />
        </Field>
      </div>
      <Field label="Category" htmlFor="rec-category" error={errors.categoryId}>
        <CategoryPicker categories={categories.filter((c) => c.type === v.kind)} value={v.categoryId} onChange={(id) => set("categoryId", id)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account" htmlFor="rec-account" error={errors.accountId}>
          <NativeSelect id="rec-account" value={v.accountId} onChange={(e) => set("accountId", e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Repeats" htmlFor="rec-frequency" error={errors.interval}>
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <Input id="rec-interval" aria-label="Every how many" inputMode="numeric" value={v.interval} onChange={(e) => set("interval", e.target.value)} />
            <NativeSelect id="rec-frequency" value={v.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)}>
              <option value="WEEKLY">week(s)</option>
              <option value="MONTHLY">month(s)</option>
              <option value="YEARLY">year(s)</option>
            </NativeSelect>
          </div>
        </Field>
        <Field label="First date" htmlFor="rec-start" error={errors.startDate} hint="Monthly items repeat on this day of the month.">
          <Input id="rec-start" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="Ends" htmlFor="rec-end" error={errors.endDate} hint="Optional">
          <Input id="rec-end" type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </Field>
      </div>
      {v.kind === "EXPENSE" ? (
        <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <span className="text-sm font-medium">Subscription</span>
          <Switch checked={v.isSubscription} onCheckedChange={(x) => set("isSubscription", x)} aria-label="Subscription" />
        </label>
      ) : null}
      <Field label="Note" htmlFor="rec-note">
        <Textarea id="rec-note" rows={2} value={v.note} onChange={(e) => set("note", e.target.value)} placeholder="Optional" />
      </Field>
      <p className="text-[13px] text-muted-foreground">
        Planned only: each occurrence shows on the calendar and in your projections, and becomes a real transaction when you record it.
      </p>
      {errors.form ? <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">{errors.form}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : item ? "Save changes" : "Add recurring item"}
      </Button>
    </form>
  );
}
