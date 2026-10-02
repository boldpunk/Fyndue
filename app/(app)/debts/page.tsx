import { Landmark, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DebtCard } from "@/components/debts/debt-card";
import { TotalDebtWidget } from "@/components/debts/total-debt-widget";
import { EmptyState } from "@/components/finance/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { countDebtsByStatus, debtTotalsByCurrency, listDebts, type DebtTab } from "@/lib/services/debts";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Долги" };

const TABS: { value: DebtTab; label: string; status: "ACTIVE" | "PAID_OFF" | "ARCHIVED" }[] = [
  { value: "active", label: "Активные", status: "ACTIVE" },
  { value: "paid", label: "Погашенные", status: "PAID_OFF" },
  { value: "archived", label: "Архив", status: "ARCHIVED" },
];

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const requested = (await searchParams).tab;
  const tab = TABS.find((t) => t.value === requested)?.value ?? "active";
  const [debts, counts] = await Promise.all([listDebts(user.id, tab), countDebtsByStatus(user.id)]);
  const totals = tab === "active" ? debtTotalsByCurrency(debts) : [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Долги"
        description="Все кредиты, рассрочки и микрозаймы: сколько уже выплачено и сколько осталось."
        actions={
          <Button asChild>
            <Link href="/debts/new">
              <Plus /> Добавить долг
            </Link>
          </Button>
        }
      />

      <nav aria-label="Статус долга" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "active" ? "/debts" : `/debts?tab=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="tabular ml-1.5 text-xs text-muted-foreground">{counts[t.status] ?? 0}</span>
          </Link>
        ))}
      </nav>

      {totals.length > 0 ? <TotalDebtWidget totals={totals} /> : null}

      {debts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={tab === "active" ? "Активных долгов нет" : tab === "paid" ? "Погашенных долгов пока нет" : "В архиве пусто"}
          description={tab === "active" ? "Добавьте кредит, рассрочку или микрозайм — Fyndue построит график и напомнит о каждом платеже." : undefined}
          action={
            tab === "active" ? (
              <Button asChild>
                <Link href="/debts/new">Добавить долг</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {debts.map((d) => (
            <DebtCard key={d.id} debt={d} />
          ))}
        </div>
      )}
    </div>
  );
}
