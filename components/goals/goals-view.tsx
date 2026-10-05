"use client";
import { Archive, Minus, MoreHorizontal, Pencil, Plus, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveGoalAction, contributeToGoalAction, createGoalAction, updateGoalAction } from "@/app/(app)/goals/actions";
import { CATEGORY_ICON_COMPONENTS, CategoryIcon } from "@/components/finance/category-icon";
import { ColorPicker } from "@/components/finance/color-picker";
import { Money } from "@/components/finance/money";
import { MoneyInput } from "@/components/finance/money-input";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Segmented } from "@/components/ui/segmented";
import type { CategoryColor, CategoryIconKey } from "@/lib/constants/categories";
import { CURRENCIES } from "@/lib/constants/finance";
import { formatLocalDate } from "@/lib/finance/dates";
import { pluralRu } from "@/lib/finance/recurrence";
import type { GoalDTO } from "@/lib/services/goals";
import { cn } from "@/lib/utils/cn";
import { offerPro, toastActionError } from "@/lib/utils/action-toast";

type AccountOption = { id: string; name: string; currency: string };
const GOAL_ICONS: CategoryIconKey[] = ["piggy-bank", "plane", "car", "house", "laptop", "smartphone", "gift", "graduation-cap", "heart-pulse", "baby", "sofa", "building-2", "trending-up", "shield"];

function GoalForm({ goal, accounts, baseCurrency, onDone }: { goal: GoalDTO | null; accounts: AccountOption[]; baseCurrency: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({
    name: goal?.name ?? "",
    icon: (goal?.icon ?? "piggy-bank") as CategoryIconKey,
    color: (goal?.color ?? "teal") as CategoryColor,
    targetAmount: goal ? goal.targetAmount.replace(/\.00$/, "") : "",
    currency: goal?.currency ?? baseCurrency,
    accountId: goal?.account?.id ?? "",
    targetDate: goal?.targetDate ?? "",
    savedAmount: "",
  });
  const linked = accounts.find((a) => a.id === v.accountId);

  const save = () =>
    startTransition(async () => {
      setError(null);
      const payload = { ...v, currency: linked?.currency ?? v.currency };
      const result = goal ? await updateGoalAction({ id: goal.id, ...payload }) : await createGoalAction(payload);
      if (!result.ok) {
        offerPro(result);
        return setError(Object.values(result.fieldErrors ?? {})[0] ?? result.error);
      }
      toast.success(goal ? "Цель обновлена" : "Цель создана");
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
      <div className="flex items-end gap-3">
        <CategoryIcon icon={v.icon} color={v.color} size="lg" />
        <Field label="На что копим" htmlFor="goal-name" className="flex-1">
          <Input id="goal-name" value={v.name} maxLength={60} placeholder="Отпуск, машина, подушка безопасности" autoFocus onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
      </div>
      <div role="radiogroup" aria-label="Иконка" className="flex flex-wrap gap-1.5">
        {GOAL_ICONS.map((key) => {
          const Icon = CATEGORY_ICON_COMPONENTS[key];
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={v.icon === key}
              aria-label={key}
              onClick={() => setV({ ...v, icon: key })}
              className={cn("grid size-9 place-items-center rounded-md border", v.icon === key ? "border-primary bg-primary-subtle text-primary" : "border-transparent bg-muted/60 text-muted-foreground")}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>
      <ColorPicker value={v.color} onChange={(color) => setV({ ...v, color })} />
      <Field label="Где копим" htmlFor="goal-account" hint={linked ? "Прогресс — баланс этого счёта. Пополняйте его переводом." : "Без счёта — отмечайте отложенные суммы в цели."}>
        <NativeSelect id="goal-account" value={v.accountId} onChange={(e) => setV({ ...v, accountId: e.target.value })}>
          <option value="">Просто откладываю (без отдельного счёта)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              На счёте {a.name} · {a.currency}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Сколько нужно" htmlFor="goal-target">
          <MoneyInput id="goal-target" value={v.targetAmount} onChange={(x) => setV({ ...v, targetAmount: x })} placeholder="0" />
        </Field>
        <Field label="Валюта" htmlFor="goal-currency">
          <NativeSelect id="goal-currency" value={linked?.currency ?? v.currency} disabled={Boolean(linked)} onChange={(e) => setV({ ...v, currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {!goal && !linked ? (
        <Field label="Уже отложено" htmlFor="goal-saved">
          <MoneyInput id="goal-saved" value={v.savedAmount} onChange={(x) => setV({ ...v, savedAmount: x })} placeholder="0" currency={v.currency} />
        </Field>
      ) : null}
      <Field label="К какой дате" htmlFor="goal-date" hint="Необязательно. С датой посчитаем, сколько откладывать в месяц.">
        <Input id="goal-date" type="date" value={v.targetDate} onChange={(e) => setV({ ...v, targetDate: e.target.value })} />
      </Field>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending || !v.name.trim() || !v.targetAmount.trim()}>
        {pending ? "Сохраняем…" : goal ? "Сохранить" : "Создать цель"}
      </Button>
    </form>
  );
}

function ContributeForm({ goal, onDone }: { goal: GoalDTO; onDone: () => void }) {
  const router = useRouter();
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await contributeToGoalAction({ id: goal.id, amount: direction === "OUT" ? `-${amount}` : amount });
      if (!result.ok) return setError(result.fieldErrors?.amount ?? result.error);
      toast.success(direction === "IN" ? "Отложено" : "Сумма забрана из цели");
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
        label="Действие"
        value={direction}
        onChange={setDirection}
        options={[
          { value: "IN", label: "Отложить" },
          { value: "OUT", label: "Забрать" },
        ]}
      />
      <Field label="Сумма" htmlFor="goal-amount" error={error ?? undefined}>
        <MoneyInput id="goal-amount" size="lg" autoFocus value={amount} onChange={setAmount} currency={goal.currency} placeholder="0" />
      </Field>
      <p className="text-[13px] text-muted-foreground">
        Сейчас отложено <Money amount={goal.progress.saved} currency={goal.currency} /> из <Money amount={goal.targetAmount} currency={goal.currency} />.
      </p>
      <Button type="submit" size="lg" disabled={pending || !amount.trim()}>
        {pending ? "Сохраняем…" : direction === "IN" ? "Отложить" : "Забрать"}
      </Button>
    </form>
  );
}

function GoalCard({ goal, onEdit, onContribute, onArchive }: { goal: GoalDTO; onEdit: () => void; onContribute: () => void; onArchive: () => void }) {
  const p = goal.progress;
  const done = p.state === "achieved";
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex items-start gap-3">
        <CategoryIcon icon={goal.icon} color={goal.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{goal.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {goal.account ? `На счёте ${goal.account.name}` : "Откладываю сам"}
            {goal.targetDate ? ` · к ${formatLocalDate(goal.targetDate)}` : ""}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Действия с «${goal.name}»`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Изменить
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArchive}>
              <Archive /> В архив
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Money amount={p.saved} currency={goal.currency} className="text-xl font-semibold" />
          <span className="text-sm text-muted-foreground">
            из <Money amount={goal.targetAmount} currency={goal.currency} />
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Number(p.percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.name}: ${p.percent}%`}>
          <div className={cn("h-full rounded-full transition-[width]", done ? "bg-success" : "bg-primary")} style={{ width: `${p.percent}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span className="tabular font-medium">{p.percent.replace(".", ",")}%</span>
          {done ? (
            <Badge tone="success">Цель достигнута 🎉</Badge>
          ) : p.state === "on-track" ? (
            <span className="text-muted-foreground">
              по <Money amount={p.perMonth!} currency={goal.currency} className="font-medium text-foreground" /> в месяц · {p.monthsLeft} {pluralRu(p.monthsLeft!, ["месяц", "месяца", "месяцев"])}
            </span>
          ) : p.state === "overdue" ? (
            <Badge tone="warning">Срок прошёл — осталось <Money amount={p.remaining} currency={goal.currency} /></Badge>
          ) : (
            <span className="text-muted-foreground">
              осталось <Money amount={p.remaining} currency={goal.currency} />
            </span>
          )}
        </div>
      </div>

      {!goal.account ? (
        <Button variant="outline" onClick={onContribute}>
          <Plus /> Отложить <Minus className="opacity-50" />
        </Button>
      ) : null}
    </Card>
  );
}

export function GoalsView({ goals, accounts, baseCurrency }: { goals: GoalDTO[]; accounts: AccountOption[]; baseCurrency: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ goal: GoalDTO | null } | null>(null);
  const [contributing, setContributing] = useState<GoalDTO | null>(null);
  const [, startTransition] = useTransition();

  const archive = (goal: GoalDTO) =>
    startTransition(async () => {
      const result = await archiveGoalAction({ id: goal.id, archived: true });
      if (!result.ok) return void toastActionError(result);
      toast.success(`«${goal.name}» в архиве`);
      router.refresh();
    });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Цели"
        description="Копите на конкретное — Fyndue посчитает, сколько откладывать в месяц."
        actions={
          <Button onClick={() => setEditing({ goal: null })}>
            <Plus /> Новая цель
          </Button>
        }
      />
      {goals.length === 0 ? (
        <Card className="grid justify-items-center gap-3 p-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary-subtle text-primary">
            <Target className="size-6" aria-hidden />
          </span>
          <h2 className="font-semibold">Пока нет целей</h2>
          <p className="max-w-sm text-sm text-muted-foreground">Отпуск, машина, подушка безопасности — задайте сумму и дату, и следите за прогрессом.</p>
          <Button onClick={() => setEditing({ goal: null })}>
            <Plus /> Создать первую цель
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onEdit={() => setEditing({ goal })} onContribute={() => setContributing(goal)} onArchive={() => archive(goal)} />
          ))}
        </div>
      )}

      <ResponsiveDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={editing?.goal ? "Изменить цель" : "Новая цель"}>
        {editing ? <GoalForm key={editing.goal?.id ?? "new"} goal={editing.goal} accounts={accounts} baseCurrency={baseCurrency} onDone={() => setEditing(null)} /> : null}
      </ResponsiveDialog>
      <ResponsiveDialog open={contributing !== null} onOpenChange={(open) => !open && setContributing(null)} title={contributing ? contributing.name : "Отложить"}>
        {contributing ? <ContributeForm goal={contributing} onDone={() => setContributing(null)} /> : null}
      </ResponsiveDialog>
    </div>
  );
}
