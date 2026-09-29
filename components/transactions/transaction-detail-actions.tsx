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

  if (transaction.isVoided || transaction.type === "DEBT_PAYMENT" || transaction.type === "LOAN_DISBURSEMENT") return null;

  const confirmIncome = () =>
    startTransition(async () => {
      const result = await confirmIncomeAction(transaction.id);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Income confirmed — balance updated");
      router.refresh();
    });

  const doVoid = () =>
    startTransition(async () => {
      const result = await voidTransactionAction({ id: transaction.id, reason });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Transaction voided");
      setVoidOpen(false);
      router.push("/transactions");
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {transaction.status === "EXPECTED" ? (
        <Button onClick={confirmIncome} disabled={pending}>
          <CheckCircle2 /> Mark as received
        </Button>
      ) : null}
      <Button variant="outline" className="text-danger" onClick={() => setVoidOpen(true)}>
        <Trash2 /> Void
      </Button>
      <ResponsiveDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={transaction.type === "TRANSFER" ? "Void transfer?" : "Void transaction?"}
        description={
          transaction.type === "TRANSFER"
            ? "Both sides of the transfer are voided and both balances are restored. The record stays in history."
            : "The balance effect is reversed. The record stays in history, marked as voided."
        }
      >
        <div className="grid gap-4">
          <Field label="Reason" htmlFor="void-reason" hint="Optional, for your own history.">
            <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </Field>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={doVoid} disabled={pending}>
              {pending ? "Voiding…" : "Void"}
            </Button>
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
