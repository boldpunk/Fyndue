import { ArrowLeftRight, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/finance/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { QuickAddButton } from "@/components/layout/quick-add";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatLocalDate, todayIn, yearMonthOf } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { listTransactions, type TransactionDTO } from "@/lib/services/transactions";
import { transactionFiltersSchema } from "@/lib/validations/transactions";

export const metadata: Metadata = { title: "Transactions" };

function groupByDate(items: TransactionDTO[]) {
  const groups = new Map<string, TransactionDTO[]>();
  for (const item of items) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  return [...groups];
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = transactionFiltersSchema.parse(await searchParams);
  const today = todayIn(user.timezone);
  const [result, accounts] = await Promise.all([
    listTransactions(user.id, filters),
    listAccounts(user.id, { includeArchived: true }),
  ]);
  const pageHref = (page: number) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
    params.set("page", String(page));
    return `/transactions?${params}`;
  };
  const filtered = Boolean(filters.type || filters.account || filters.month || filters.q || filters.category);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Transactions"
        description={`${result.total} ${result.total === 1 ? "transaction" : "transactions"}${filtered ? " match the filters" : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/transactions/recurring">
                <Repeat /> Recurring
              </Link>
            </Button>
            <span className="hidden gap-2 sm:flex">
              <QuickAddButton kind="INCOME" label="Income" className="bg-secondary text-secondary-foreground hover:bg-secondary/70" />
              <QuickAddButton kind="TRANSFER" label="Transfer" className="bg-secondary text-secondary-foreground hover:bg-secondary/70" />
              <QuickAddButton kind="EXPENSE" label="Expense" />
            </span>
          </div>
        }
      />

      <TransactionFilters accounts={accounts.map(({ id, name }) => ({ id, name }))} currentMonth={yearMonthOf(today)} />

      {result.items.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title={filtered ? "Nothing matches these filters" : "No transactions yet"}
          description={filtered ? "Try another month, account or search." : "Record an expense, income or transfer to get started."}
          action={
            filtered ? (
              <Button variant="outline" asChild>
                <Link href="/transactions">Clear filters</Link>
              </Button>
            ) : (
              <QuickAddButton label="Add transaction" />
            )
          }
        />
      ) : (
        <div className="grid gap-4">
          {groupByDate(result.items).map(([date, items]) => (
            <section key={date} aria-label={date} className="grid gap-1">
              <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {date === today ? "Today" : formatLocalDate(date, "en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </h2>
              <Card className="grid gap-0.5 p-1.5">
                {items.map((t) => (
                  <TransactionRow key={t.id} transaction={t} showDate={false} perspectiveAccountId={filters.account} />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      {result.pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" asChild disabled={result.page <= 1}>
            {result.page > 1 ? <Link href={pageHref(result.page - 1)}>Previous</Link> : <span aria-disabled>Previous</span>}
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {result.page} of {result.pageCount}
          </span>
          <Button variant="outline" size="sm" asChild>
            {result.page < result.pageCount ? <Link href={pageHref(result.page + 1)}>Next</Link> : <span aria-disabled>Next</span>}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
