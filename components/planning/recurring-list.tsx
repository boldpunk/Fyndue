"use client";
import { MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteRecurringAction, setRecurringActiveAction } from "@/app/(app)/planning-actions";
import { CategoryIcon } from "@/components/finance/category-icon";
import { EmptyState } from "@/components/finance/empty-state";
import { Money } from "@/components/finance/money";
import type { AccountOption, CategoryOption } from "@/components/transactions/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { formatLocalDate } from "@/lib/finance/dates";
import { describeRule } from "@/lib/finance/recurrence";
import type { RecurringDTO } from "@/lib/services/recurring";
import { RecurringForm } from "./recurring-form";
import { toastActionError } from "@/lib/utils/action-toast";

export function RecurringList({
  items,
  accounts,
  categories,
  today,
}: {
  items: RecurringDTO[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  today: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RecurringDTO | "new" | null>(null);
  const [deleting, setDeleting] = useState<RecurringDTO | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (item: RecurringDTO) =>
    startTransition(async () => {
      const result = await setRecurringActiveAction({ id: item.id, archived: item.isActive });
      if (!result.ok) return void toastActionError(result);
      toast.success(item.isActive ? `«${item.name}» приостановлен` : `«${item.name}» возобновлён`);
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      if (!deleting) return;
      const result = await deleteRecurringAction(deleting.id);
      if (!result.ok) return void toastActionError(result);
      toast.success("Регулярный платёж удалён, записанные операции сохранены");
      setDeleting(null);
      router.refresh();
    });

  const groups = [
    { title: "Расходы и подписки", rows: items.filter((i) => i.kind === "EXPENSE") },
    { title: "Доходы", rows: items.filter((i) => i.kind === "INCOME") },
  ].filter((g) => g.rows.length);

  return (
    <div className="grid gap-6">
      <div>
        <Button onClick={() => setEditing("new")}>
          <Plus /> Новый регулярный платёж
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Регулярных платежей пока нет"
          description="Добавьте счета, подписки и зарплату — тогда календарь и прогноз баланса будут знать, что впереди."
        />
      ) : (
        groups.map((g) => (
          <section key={g.title} className="grid gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">{g.title}</h2>
            <Card className="divide-y">
              {g.rows.map((item) => (
                <div key={item.id} className={`flex items-center gap-3 p-3 ${item.isActive ? "" : "opacity-60"}`}>
                  <CategoryIcon icon={item.category?.icon} color={item.category?.color} />
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {item.name}
                      {item.isSubscription ? <Badge tone="primary">Подписка</Badge> : null}
                      {!item.isActive ? <Badge>Приостановлен</Badge> : null}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {describeRule(item)} · {item.account.name}
                      {item.nextOccurrence ? ` · следующий ${formatLocalDate(item.nextOccurrence, undefined, { day: "numeric", month: "short" })}` : item.isActive ? " · завершён" : ""}
                    </p>
                  </div>
                  <Money
                    amount={item.kind === "EXPENSE" ? `-${item.amount}` : item.amount}
                    currency={item.currency}
                    signed
                    tone={item.kind === "INCOME" ? "positive" : "neutral"}
                    className="text-sm font-medium"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Действия: ${item.name}`} disabled={pending}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(item)}>
                        <Pencil /> Изменить
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => toggle(item)}>
                        {item.isActive ? <Pause /> : <Play />} {item.isActive ? "Приостановить" : "Возобновить"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDeleting(item)} className="text-danger">
                        <Trash2 /> Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </Card>
          </section>
        ))
      )}

      <ResponsiveDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={editing === "new" ? "Новый регулярный платёж" : "Изменить регулярный платёж"}>
        {editing ? (
          <RecurringForm
            key={editing === "new" ? "new" : editing.id}
            item={editing === "new" ? undefined : editing}
            accounts={accounts}
            categories={categories}
            today={today}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить «${deleting?.name ?? ""}»?`}
        description="Будущие платежи исчезнут из календаря и прогнозов. Уже записанные операции останутся. Чтобы остановить на время, лучше приостановите."
      >
        <div className="flex gap-2">
          <Button variant="destructive" onClick={remove} disabled={pending}>
            Удалить
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Отмена
          </Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
