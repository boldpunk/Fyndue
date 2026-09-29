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

export const metadata: Metadata = { title: "Debts" };

const TABS: { value: DebtTab; label: string; status: "ACTIVE" | "PAID_OFF" | "ARCHIVED" }[] = [
  { value: "active", label: "Active", status: "ACTIVE" },
  { value: "paid", label: "Paid off", status: "PAID_OFF" },
  { value: "archived", label: "Archived", status: "ARCHIVED" },
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
        title="Debts"
        description="Every loan, installment and microloan, with what's paid and what's left."
        actions={
          <Button asChild>
            <Link href="/debts/new">
              <Plus /> Add debt
            </Link>
          </Button>
        }
      />

      <nav aria-label="Debt status" className="flex gap-1 border-b">
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
          title={tab === "active" ? "No active debts" : tab === "paid" ? "Nothing paid off yet" : "No archived debts"}
          description={tab === "active" ? "Add a loan, car installment or microloan to track its schedule and never miss a payment." : undefined}
          action={
            tab === "active" ? (
              <Button asChild>
                <Link href="/debts/new">Add debt</Link>
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
