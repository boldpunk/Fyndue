"use client";
import { CheckCircle2, CircleAlert, Copy, Pencil, Plus, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { copyBudgetsAction, deleteBudgetAction, setBudgetAction } from "@/app/(app)/planning-actions";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/finance/money";
import { MoneyInput } from "@/components/finance/money-input";
import { ProgressBar } from "@/components/finance/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { formatMoney, formatPercent } from "@/lib/finance/money";
import type { BudgetLineDTO, BudgetMonthDTO } from "@/lib/services/budgets";

const STATE_META = {
  UNDER: { label: "В норме", tone: "success", icon: CheckCircle2, bar: "success" },
  NEAR: { label: "Близко к лимиту", tone: "warning", icon: TriangleAlert, bar: "warning" },
  OVER: { label: "Лимит превышен", tone: "danger", icon: CircleAlert, bar: "danger" },
} as const;

function StateBadge({ state }: { state: NonNullable<BudgetLineDTO["state"]> }) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon aria-hidden /> {meta.label}
    </Badge>
  );
}

type Editing = { categoryId: string | null; name: string; amount: string; id: string | null; pickCategory?: boolean };

export function BudgetView({ data, expenseCategories }: { data: BudgetMonthDTO; expenseCategories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cur = data.currency;
  const budgetedIds = new Set(data.categories.map((c) => c.category?.id));
  const available = expenseCategories.filter((c) => !budgetedIds.has(c.id));

  const save = () =>
    startTransition(async () => {
      if (!editing) return;
      setError(null);
      const result = await setBudgetAction({ ...data.month, currency: cur, categoryId: editing.categoryId ?? undefined, amount: editing.amount });
      if (!result.ok) return setError(result.fieldErrors?.amount ?? result.error);
      toast.success("Бюджет сохранён");
      setEditing(null);
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      if (!editing?.id) return;
      const result = await deleteBudgetAction(editing.id);
      if (!result.ok) return setError(result.error);
      toast.success("Бюджет удалён");
      setEditing(null);
      router.refresh();
    });

  const copy = () =>
    startTransition(async () => {
      const result = await copyBudgetsAction(data.month);
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.data.copied ? `Скопировано из прошлого месяца: ${result.data.copied}` : "Нечего копировать");
      router.refresh();
    });

  const open = (line: BudgetLineDTO | null, overall = false) =>
    setEditing({
      id: line?.id ?? null,
      categoryId: overall ? null : (line?.category?.id ?? null),
      name: overall ? "Общий бюджет на месяц" : (line?.category?.name ?? ""),
      amount: line?.limit ? formatMoney(line.limit, "", { hideCurrency: true }) : "",
    });

  const Line = ({ line }: { line: BudgetLineDTO }) => (
    <div className="grid gap-2 p-4">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={line.category?.icon} color={line.category?.color} size="sm" />
        <span className="flex-1 truncate text-sm font-medium">{line.category?.name}</span>
        {line.state ? <StateBadge state={line.state} /> : null}
        <Button variant="ghost" size="icon-sm" aria-label={`Изменить бюджет «${line.category?.name}»`} onClick={() => open(line)}>
          <Pencil />
        </Button>
      </div>
      <ProgressBar percent={line.percent ?? "0"} label={`Бюджет «${line.category?.name}»: использовано`} tone={line.state ? STATE_META[line.state].bar : "primary"} />
      <p className="text-[13px] text-muted-foreground">
        <Money amount={line.spent} currency={cur} className="font-medium text-foreground" /> / <Money amount={line.limit!} currency={cur} /> —{" "}
        <span className="tabular">{line.percent ? formatPercent(line.percent) : "—"}</span> ·{" "}
        {line.state === "OVER" ? (
          <>
            перерасход <Money amount={line.remaining!.replace("-", "")} currency={cur} className="text-danger" />
          </>
        ) : (
          <>
            <Money amount={line.remaining!} currency={cur} /> осталось
          </>
        )}
      </p>
    </div>
  );

  return (
    <div className="grid gap-6">
      {data.categories.length === 0 && data.overall.limit === null && data.hasPreviousMonthBudgets ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4 text-sm">
          <span className="text-muted-foreground">Бюджетов на этот месяц пока нет.</span>
          <Button variant="outline" size="sm" onClick={copy} disabled={pending}>
            <Copy /> Скопировать с прошлого месяца
          </Button>
        </div>
      ) : null}

      <Card className="grid gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Общий бюджет на месяц</h2>
          {data.overall.state ? <StateBadge state={data.overall.state} /> : null}
        </div>
        {data.overall.limit ? (
          <>
            <p>
              <Money amount={data.overall.spent} currency={cur} className="text-2xl font-semibold tracking-tight" />
              <span className="text-muted-foreground">
                {" "}
                / <Money amount={data.overall.limit} currency={cur} /> · <span className="tabular">{data.overall.percent ? formatPercent(data.overall.percent) : "—"}</span>
              </span>
            </p>
            <ProgressBar percent={data.overall.percent ?? "0"} label="Общий бюджет: использовано" tone={data.overall.state ? STATE_META[data.overall.state].bar : "primary"} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
              <span>
                Бюджеты категорий в сумме <Money amount={data.categoryBudgetTotal} currency={cur} />
              </span>
              <Button variant="ghost" size="sm" onClick={() => open(data.overall, true)}>
                <Pencil /> Изменить
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Потрачено <Money amount={data.overall.spent} currency={cur} className="font-medium text-foreground" /> в этом месяце. Задайте общий лимит, чтобы видеть остаток.
            </p>
            <Button variant="outline" size="sm" onClick={() => open(null, true)}>
              <Plus /> Задать общий бюджет
            </Button>
          </div>
        )}
      </Card>

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Бюджеты по категориям</h2>
          {available.length ? (
            <Button size="sm" onClick={() => setEditing({ id: null, categoryId: available[0]!.id, name: "", amount: "", pickCategory: true })}>
              <Plus /> Добавить бюджет
            </Button>
          ) : null}
        </div>
        {data.categories.length ? (
          <Card className="divide-y">
            {data.categories.map((line) => (
              <Line key={line.id} line={line} />
            ))}
          </Card>
        ) : (
          <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">Бюджетов по категориям пока нет — например, «Топливо» 1 500 000 в месяц.</p>
        )}
      </section>

      {data.unbudgeted.length ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Расходы без бюджета</h2>
          <Card className="divide-y">
            {data.unbudgeted.map((line) => (
              <div key={line.category?.id} className="flex items-center gap-3 p-3">
                <CategoryIcon icon={line.category?.icon} color={line.category?.color} size="sm" />
                <span className="flex-1 truncate text-sm">{line.category?.name}</span>
                <Money amount={line.spent} currency={cur} className="text-sm font-medium" />
                <Button variant="ghost" size="sm" onClick={() => open(line)}>
                  Задать бюджет
                </Button>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <ResponsiveDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing?.pickCategory ? "Бюджет для категории" : `Бюджет · ${editing?.name ?? ""}`}>
        {editing ? (
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {editing.pickCategory ? (
              <Field label="Категория" htmlFor="budget-category">
                <NativeSelect id="budget-category" value={editing.categoryId ?? ""} onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })}>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field label="Лимит на месяц" htmlFor="budget-amount" error={error ?? undefined}>
              <MoneyInput id="budget-amount" size="lg" currency={cur} value={editing.amount} onChange={(amount) => setEditing({ ...editing, amount })} autoFocus />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Сохраняем…" : "Сохранить бюджет"}
              </Button>
              {editing.id ? (
                <Button type="button" variant="ghost" className="text-danger" onClick={remove} disabled={pending}>
                  Удалить бюджет
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </ResponsiveDialog>
    </div>
  );
}
