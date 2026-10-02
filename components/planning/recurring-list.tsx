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
      if (!result.ok) return void toast.error(result.error);
      toast.success(item.isActive ? `“${item.name}” paused` : `“${item.name}” resumed`);
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      if (!deleting) return;
      const result = await deleteRecurringAction(deleting.id);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Recurring item deleted — recorded transactions are kept");
      setDeleting(null);
      router.refresh();
    });

  const groups = [
    { title: "Expenses & subscriptions", rows: items.filter((i) => i.kind === "EXPENSE") },
    { title: "Income", rows: items.filter((i) => i.kind === "INCOME") },
  ].filter((g) => g.rows.length);

  return (
    <div className="grid gap-6">
      <div>
        <Button onClick={() => setEditing("new")}>
          <Plus /> New recurring item
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring items yet"
          description="Add bills, subscriptions and salary so the calendar and your projected balance know what's coming."
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
                      {item.isSubscription ? <Badge tone="primary">Subscription</Badge> : null}
                      {!item.isActive ? <Badge>Paused</Badge> : null}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {describeRule(item)} · {item.account.name}
                      {item.nextOccurrence ? ` · next ${formatLocalDate(item.nextOccurrence, undefined, { day: "numeric", month: "short" })}` : item.isActive ? " · ended" : ""}
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
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.name}`} disabled={pending}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(item)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => toggle(item)}>
                        {item.isActive ? <Pause /> : <Play />} {item.isActive ? "Pause" : "Resume"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDeleting(item)} className="text-danger">
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </Card>
          </section>
        ))
      )}

      <ResponsiveDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={editing === "new" ? "New recurring item" : "Edit recurring item"}>
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
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="Future occurrences disappear from the calendar and projections. Transactions you already recorded stay. To stop it temporarily, pause it instead."
      >
        <div className="flex gap-2">
          <Button variant="destructive" onClick={remove} disabled={pending}>
            Delete
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
