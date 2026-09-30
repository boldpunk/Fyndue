"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addExchangeRateAction, deleteExchangeRateAction } from "@/app/(app)/planning-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { CURRENCIES } from "@/lib/constants/finance";
import { formatLocalDate } from "@/lib/finance/dates";
import type { ExchangeRateDTO } from "@/lib/services/exchange-rates";

export function ExchangeRates({ rates, baseCurrency, today }: { rates: ExchangeRateDTO[]; baseCurrency: string; today: string }) {
  const router = useRouter();
  const firstOther = CURRENCIES.find((c) => c !== baseCurrency) ?? "USD";
  const [v, setV] = useState({ fromCurrency: firstOther as string, toCurrency: baseCurrency, rate: "", effectiveDate: today });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      setErrors({});
      const result = await addExchangeRateAction(v);
      if (!result.ok) return setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
      toast.success("Rate saved");
      setV((s) => ({ ...s, rate: "" }));
      router.refresh();
    });
  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteExchangeRateAction(id);
      if (!result.ok) return void toast.error(result.error);
      router.refresh();
    });

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-[1fr_1fr_1.3fr_1.2fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field label="1 ×" htmlFor="fx-from" error={errors.fromCurrency}>
            <NativeSelect id="fx-from" value={v.fromCurrency} onChange={(e) => setV({ ...v, fromCurrency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="in" htmlFor="fx-to" error={errors.toCurrency}>
            <NativeSelect id="fx-to" value={v.toCurrency} onChange={(e) => setV({ ...v, toCurrency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Rate" htmlFor="fx-rate" error={errors.rate}>
            <Input id="fx-rate" inputMode="decimal" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} placeholder="e.g. 12700" />
          </Field>
          <Field label="From date" htmlFor="fx-date" error={errors.effectiveDate}>
            <Input id="fx-date" type="date" value={v.effectiveDate} onChange={(e) => setV({ ...v, effectiveDate: e.target.value })} />
          </Field>
          <Button type="submit" disabled={pending}>
            Add rate
          </Button>
        </form>
        {errors.form && !Object.keys(errors).some((k) => k !== "form") ? <p role="alert" className="mt-3 text-sm text-danger">{errors.form}</p> : null}
      </Card>

      {rates.length ? (
        <Card className="divide-y">
          {rates.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="tabular flex-1">
                1 {r.fromCurrency} = <span className="font-medium">{r.rate}</span> {r.toCurrency}
              </span>
              <span className="text-muted-foreground">from {formatLocalDate(r.effectiveDate)}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete rate from ${r.effectiveDate}`} onClick={() => remove(r.id)} disabled={pending}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </Card>
      ) : (
        <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No rates yet.</p>
      )}
    </div>
  );
}
