import { ArrowLeftRight, Download, Repeat } from "lucide-react";
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
import { pluralRu } from "@/lib/finance/recurrence";

export const metadata: Metadata = { title: "Операции" };

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
  const exportParams = new URLSearchParams(
    Object.entries(filters)
      .filter(([k, v]) => k !== "page" && v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  );
  const filtered = Boolean(filters.type || filters.account || filters.month || filters.q || filters.category);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Операции"
        description={`${result.total} ${pluralRu(result.total, ["операция", "операции", "операций"])}${filtered ? " по выбранным фильтрам" : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {result.total > 0 ? (
              <Button variant="outline" asChild>
                {/* A plain link: the route answers with a file download. */}
                <a href={`/api/export/transactions?${exportParams}`} download title="Скачать операции для Excel (CSV) — с текущими фильтрами">
                  <Download /> Excel
                </a>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href="/transactions/recurring">
                <Repeat /> Регулярные
              </Link>
            </Button>
            <span className="hidden gap-2 sm:flex">
              <QuickAddButton kind="INCOME" label="Доход" className="bg-secondary text-secondary-foreground hover:bg-secondary/70" />
              <QuickAddButton kind="TRANSFER" label="Перевод" className="bg-secondary text-secondary-foreground hover:bg-secondary/70" />
              <QuickAddButton kind="EXPENSE" label="Расход" />
            </span>
          </div>
        }
      />

      <TransactionFilters accounts={accounts.map(({ id, name }) => ({ id, name }))} currentMonth={yearMonthOf(today)} />

      {result.items.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title={filtered ? "По этим фильтрам ничего нет" : "Операций пока нет"}
          description={filtered ? "Попробуйте другой месяц, счёт или поиск." : "Запишите расход, доход или перевод, чтобы начать."}
          action={
            filtered ? (
              <Button variant="outline" asChild>
                <Link href="/transactions">Сбросить фильтры</Link>
              </Button>
            ) : (
              <QuickAddButton label="Добавить операцию" />
            )
          }
        />
      ) : (
        <div className="grid gap-4">
          {groupByDate(result.items).map(([date, items]) => (
            <section key={date} aria-label={date} className="grid gap-1">
              <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {date === today ? "Сегодня" : formatLocalDate(date, undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
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
        <nav aria-label="Страницы" className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" asChild disabled={result.page <= 1}>
            {result.page > 1 ? <Link href={pageHref(result.page - 1)}>Назад</Link> : <span aria-disabled>Назад</span>}
          </Button>
          <span className="text-sm text-muted-foreground">
            Страница {result.page} из {result.pageCount}
          </span>
          <Button variant="outline" size="sm" asChild>
            {result.page < result.pageCount ? <Link href={pageHref(result.page + 1)}>Дальше</Link> : <span aria-disabled>Дальше</span>}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
