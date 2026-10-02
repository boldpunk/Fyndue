"use client";
import { Paperclip, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reversePaymentAction } from "@/app/(app)/debts/actions";
import { Money } from "@/components/finance/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { formatLocalDate } from "@/lib/finance/dates";
import { money } from "@/lib/finance/money";
import type { DebtPaymentDTO } from "@/lib/services/debts";
import { cn } from "@/lib/utils/cn";

function Breakdown({ p, currency }: { p: DebtPaymentDTO; currency: string }) {
  const parts: [string, string][] = [
    ["Основной долг", p.principal],
    ["Проценты", p.interest],
    ["Комиссия за выдачу", p.originationFee],
    ["Прочие комиссии", p.otherFee],
    ["Штраф", p.penalty],
    ["Комиссия за перевод", p.processingFee],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-3">
      {parts
        .filter(([, v]) => money(v).gt(0))
        .map(([label, v]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>
              <Money amount={v} currency={currency} hideCurrency />
            </dd>
          </div>
        ))}
    </dl>
  );
}

export function PaymentHistory({
  payments,
  currency,
  debtId,
  receipts = {},
}: {
  payments: DebtPaymentDTO[];
  currency: string;
  debtId: string;
  /** Documents linked to each payment, by payment id. */
  receipts?: Partial<Record<string, { id: string; name: string }[]>>;
}) {
  const router = useRouter();
  const [reversing, setReversing] = useState<DebtPaymentDTO | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      if (!reversing) return;
      setError(null);
      const result = await reversePaymentAction({ paymentId: reversing.id, reason });
      if (!result.ok) return setError(result.fieldErrors?.reason ?? result.error);
      toast.success("Платёж отменён, балансы восстановлены");
      setReversing(null);
      setReason("");
      router.refresh();
    });

  if (payments.length === 0) {
    return <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Платежей пока нет.</p>;
  }

  return (
    <>
      <div className="grid gap-2">
        {payments.map((p) => (
          <Card key={p.id} className={cn("grid gap-3 p-4", p.isReversed && "opacity-60")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-0.5">
                <p className="text-sm font-medium">
                  {formatLocalDate(p.paymentDate)}
                  {p.installmentNumber ? <span className="text-muted-foreground"> · платёж №{p.installmentNumber}</span> : null}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  со счёта{" "}
                  {p.transactionId ? (
                    <Link href={`/transactions/${p.transactionId}`} className="hover:underline">
                      {p.account.name}
                    </Link>
                  ) : (
                    p.account.name
                  )}
                  {p.note ? ` · ${p.note}` : ""}
                </p>
              </div>
              <div className="grid justify-items-end gap-1">
                <Money amount={p.actualAccountDebit} currency={currency} className={cn("font-semibold", p.isReversed && "line-through")} />
                <div className="flex gap-1">
                  {p.isEarlyRepayment ? <Badge tone="primary">Досрочно</Badge> : null}
                  {p.isReversed ? <Badge>Отменён</Badge> : null}
                </div>
              </div>
            </div>
            <Breakdown p={p} currency={currency} />
            {p.isReversed && p.reversalReason ? <p className="text-[13px] text-muted-foreground">Причина отмены: {p.reversalReason}</p> : null}
            {receipts[p.id]?.length ? (
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                {receipts[p.id]!.map((r) => (
                  <li key={r.id}>
                    <a href={`/api/documents/${r.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Paperclip className="size-3.5" aria-hidden /> {r.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-1">
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <Link href={`/debts/${debtId}?tab=documents&payment=${p.id}`}>
                  <Paperclip /> Прикрепить чек
                </Link>
              </Button>
              {!p.isReversed ? (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setReversing(p)}>
                  <Undo2 /> Отменить
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      <ResponsiveDialog
        open={reversing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReversing(null);
            setError(null);
          }
        }}
        title="Отменить платёж?"
        description="Платёж останется в истории с пометкой «отменён». Баланс счёта, остаток долга и платёж по графику восстановятся."
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          {reversing ? (
            <p className="text-sm">
              <Money amount={reversing.actualAccountDebit} currency={currency} className="font-semibold" /> вернётся на счёт {reversing.account.name}.
            </p>
          ) : null}
          <Field label="Причина" htmlFor="reverse-reason" error={error ?? undefined}>
            <Input id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus placeholder="например, записан дважды" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Отменяем…" : "Отменить платёж"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setReversing(null)}>
              Отмена
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
