"use client";
import { LogOut, Plus, Undo2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createSharedTransactionAction, removeShareAction, voidSharedTransactionAction } from "@/app/(app)/accounts/shared-actions";
import { Money } from "@/components/finance/money";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { SharedAccountDetail } from "@/lib/services/shared-accounts";
import { toastActionError } from "@/lib/utils/action-toast";

export function SharedAccountView({ shared, today }: { shared: SharedAccountDetail; today: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const { account, owner } = shared;

  const cancel = (id: string) =>
    startTransition(async () => {
      const result = await voidSharedTransactionAction(id);
      if (!result.ok) return void toastActionError(result);
      toast.success("Операция отменена");
      router.refresh();
    });

  const leave = () =>
    startTransition(async () => {
      if (!window.confirm(`Выйти из счёта «${account.name}»? Снова открыть доступ сможет только ${owner.name}.`)) return;
      const result = await removeShareAction(shared.shareId);
      if (!result.ok) return void toastActionError(result);
      toast.success("Вы вышли из общего счёта");
      router.push("/accounts");
      router.refresh();
    });

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-4" aria-hidden /> {account.name} · общий счёт
          </p>
          <Money amount={account.currentBalance} currency={account.currency} className="text-3xl font-semibold tracking-tight" />
          <div>
            <Badge tone="primary">Владелец: {owner.name}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setFormKey((k) => k + 1);
              setAdding(true);
            }}
          >
            <Plus /> Добавить
          </Button>
          <Button variant="outline" disabled={pending} onClick={leave}>
            <LogOut /> Выйти
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Операции</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-0.5 pt-3">
          {shared.transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">По этому счёту пока нет операций.</p>
          ) : (
            shared.transactions.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={{ ...t, createdBy: t.mine ? "вы" : t.createdBy }}
                perspectiveAccountId={account.id}
                href={null}
                action={
                  t.mine && !t.isVoided ? (
                    <Button variant="ghost" size="icon-sm" aria-label="Отменить мою операцию" disabled={pending} onClick={() => cancel(t.id)}>
                      <Undo2 />
                    </Button>
                  ) : null
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <ResponsiveDialog open={adding} onOpenChange={setAdding} title={`Операция · ${account.name}`}>
        <TransactionForm
          key={formKey}
          accounts={[{ id: account.id, name: account.name, currency: account.currency, currentBalance: account.currentBalance }]}
          categories={shared.categories}
          today={today}
          kinds={["EXPENSE", "INCOME"]}
          createAction={createSharedTransactionAction}
          onDone={() => setAdding(false)}
        />
      </ResponsiveDialog>
    </>
  );
}
