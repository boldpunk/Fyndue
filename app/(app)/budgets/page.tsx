import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { BudgetView } from "@/components/planning/budget-view";
import { CurrencySwitch, MonthNav } from "@/components/planning/month-nav";
import { requireUser } from "@/lib/auth/session";
import { CURRENCIES } from "@/lib/constants/finance";
import { formatYearMonth, parseYearMonth, todayIn, yearMonthOf } from "@/lib/finance/dates";
import { getBudgetMonth } from "@/lib/services/budgets";
import { listCategories } from "@/lib/services/categories";

export const metadata: Metadata = { title: "Бюджеты" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string; currency?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const month = parseYearMonth(query.month) ?? yearMonthOf(todayIn(user.timezone));
  const currency = CURRENCIES.find((c) => c === query.currency);
  const [data, categories] = await Promise.all([
    getBudgetMonth(user.id, month, currency),
    listCategories(user.id, { type: "EXPENSE", includeSystem: false }),
  ]);
  const params = { currency: data.currency === user.baseCurrency ? undefined : data.currency };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        title="Бюджеты"
        description="Лимиты на месяц — общий и по категориям. Переводы и платежи по долгам никогда не считаются расходами."
        actions={
          <div className="flex flex-wrap gap-2">
            <CurrencySwitch current={data.currency} currencies={data.currencies} basePath="/budgets" params={{ month: formatYearMonth(month) }} />
            <MonthNav month={month} basePath="/budgets" params={params} />
          </div>
        }
      />
      <BudgetView key={`${formatYearMonth(month)}-${data.currency}`} data={data} expenseCategories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
