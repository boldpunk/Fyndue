"use client";
import { ArrowLeftRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { convertAdjustmentAction } from "@/app/(app)/transactions/actions";
import type { AccountOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { ConversionFields, type ConversionValues } from "./conversion-fields";

/** Turns a balance adjustment into the conversion/transfer it really was. */
export function ConvertAdjustment({
  transaction,
  accounts,
  fxRates,
}: {
  transaction: { id: string; amount: string; currency: string; direction: "INFLOW" | "OUTFLOW"; accountId: string };
  accounts: AccountOption[];
  fxRates: Record<string, string>;
}) {
  const router = useRouter();
  const others = accounts.filter((a) => a.id !== transaction.accountId);
  // Usually the other currency: a dollar top-up comes from a sum card and vice versa.
  const preferred = others.find((a) => a.currency !== transaction.currency) ?? others[0];
  const [value, setValue] = useState<ConversionValues>({ counterpartAccountId: preferred?.id ?? "", counterpartAmount: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (others.length === 0) return null;
  const save = () =>
    startTransition(async () => {
      setErrors({});
      const result = await convertAdjustmentAction({ id: transaction.id, ...value });
      if (!result.ok) {
        const fe = result.fieldErrors ?? {};
        return setErrors({ counterpartAmount: fe.counterpartAmount ?? fe.toAmount ?? fe.amount ?? "", counterpartAccountId: fe.counterpartAccountId ?? "", form: result.error });
      }
      toast.success("Готово: теперь это конвертация между счетами");
      router.push(`/transactions/${result.data.id}`);
      router.refresh();
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
        Если деньги на самом деле {transaction.direction === "INFLOW" ? "пришли с другого счёта (например, купили доллары за сумы)" : "ушли на другой счёт"}, запишите это как конвертацию. Корректировка аннулируется, баланс этого счёта не изменится, а второй счёт обновится на указанную сумму.
      </p>
      <ConversionFields
        accounts={others}
        currency={transaction.currency}
        amount={transaction.amount}
        direction={transaction.direction === "INFLOW" ? "IN" : "OUT"}
        fxRates={fxRates}
        value={value}
        onChange={setValue}
        errors={errors}
      />
      {errors.form ? (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending || !value.counterpartAccountId}>
          <ArrowLeftRight /> {pending ? "Сохраняем…" : "Сделать конвертацией"}
        </Button>
      </div>
    </form>
  );
}
