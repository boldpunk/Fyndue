"use client";
import { CheckCircle2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmIncomeAction, voidTransactionAction } from "@/app/(app)/transactions/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { TransactionDTO } from "@/lib/services/transactions";

export function TransactionDetailActions({ transaction }: { transaction: TransactionDTO }) {
  const router = useRouter();
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  if (transaction.isVoided || transaction.type === "DEBT_PAYMENT" || transaction.type === "LOAN_DISBURSEMENT") {
    return transaction.type === "DEBT_PAYMENT" && !transaction.isVoided ? (
      <p className="text-[13px] text-muted-foreground">Платёж по долгу отменяется на вкладке «Платежи» этого долга — тогда восстановятся и остаток, и график.</p>
    ) : null;
  }

  const confirmIncome = () =>
    startTransition(async () => {
      const result = await confirmIncomeAction(transaction.id);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Доход подтверждён, баланс обновлён");
      router.refresh();
    });

  const doVoid = () =>
    startTransition(async () => {
      const result = await voidTransactionAction({ id: transaction.id, reason });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Операция аннулирована");
      setVoidOpen(false);
      router.push("/transactions");
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {transaction.status === "EXPECTED" ? (
        <Button onClick={confirmIncome} disabled={pending}>
          <CheckCircle2 /> Деньги получены
        </Button>
      ) : null}
      <Button variant="outline" className="text-danger" onClick={() => setVoidOpen(true)}>
        <Trash2 /> Аннулировать
      </Button>
      <ResponsiveDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={transaction.type === "TRANSFER" ? "Аннулировать перевод?" : "Аннулировать операцию?"}
        description={
          transaction.type === "TRANSFER"
            ? "Обе части перевода аннулируются, балансы обоих счетов восстановятся. Запись останется в истории."
            : "Влияние на баланс отменится. Запись останется в истории с пометкой «аннулирована»."
        }
      >
        <div className="grid gap-4">
          <Field label="Причина" htmlFor="void-reason" hint="Необязательно, для вашей истории.">
            <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </Field>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={doVoid} disabled={pending}>
              {pending ? "Аннулируем…" : "Аннулировать"}
            </Button>
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
