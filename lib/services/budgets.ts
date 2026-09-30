import "server-only";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { budgetStatus, type BudgetState } from "@/lib/finance/budget";
import { localDateToDb, monthBounds, shiftYearMonth, type YearMonth } from "@/lib/finance/dates";
import { money, sumMoney, toMoneyString } from "@/lib/finance/money";
import type { Currency } from "@/lib/generated/prisma/client";
import type { BudgetInput } from "@/lib/validations/planning";
import { writeAudit } from "./audit";

export type BudgetLineDTO = {
  id: string | null;
  category: { id: string; name: string; icon: string; color: string | null } | null;
  limit: string | null;
  spent: string;
  remaining: string | null;
  percent: string | null;
  state: BudgetState | null;
};

export type BudgetMonthDTO = {
  month: YearMonth;
  currency: Currency;
  currencies: Currency[];
  overall: BudgetLineDTO;
  categories: BudgetLineDTO[];
  /** Spending in categories without a budget. */
  unbudgeted: BudgetLineDTO[];
  totalSpent: string;
  categoryBudgetTotal: string;
  hasPreviousMonthBudgets: boolean;
};

function line(
  id: string | null,
  category: BudgetLineDTO["category"],
  limit: string | null,
  spent: string,
): BudgetLineDTO {
  if (limit === null) return { id, category, limit, spent, remaining: null, percent: null, state: null };
  const s = budgetStatus({ spent, limit });
  return {
    id,
    category,
    limit,
    spent,
    remaining: toMoneyString(s.remaining),
    percent: s.percent.toDecimalPlaces(0).toFixed(0),
    state: s.state,
  };
}

/** Budgets and actual spending for one month and currency (SPEC §38). */
export async function getBudgetMonth(userId: string, month: YearMonth, currency?: Currency): Promise<BudgetMonthDTO> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } });
  const bounds = monthBounds(month);
  const range = { gte: localDateToDb(bounds.start), lt: localDateToDb(bounds.endExclusive) };
  const accountCurrencies = await prisma.account.findMany({ where: { userId, isArchived: false }, select: { currency: true }, distinct: ["currency"] });
  const currencies = [...new Set<Currency>([user.baseCurrency, ...accountCurrencies.map((a) => a.currency)])];
  const cur = currency && currencies.includes(currency) ? currency : user.baseCurrency;
  const previous = shiftYearMonth(month, -1);

  const [budgets, spending, categories, previousCount] = await Promise.all([
    prisma.budget.findMany({ where: { userId, year: month.year, month: month.month, currency: cur } }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "EXPENSE", status: "ACTUAL", voidedAt: null, currency: cur, transactionDate: range },
      _sum: { amount: true },
    }),
    prisma.category.findMany({ where: { userId, type: "EXPENSE", isSystem: false }, orderBy: [{ sortOrder: "asc" }] }),
    prisma.budget.count({ where: { userId, year: previous.year, month: previous.month } }),
  ]);

  const spentBy = new Map(spending.map((s) => [s.categoryId, toMoneyString(s._sum.amount ?? 0)]));
  const totalSpent = sumMoney(spending.map((s) => s._sum.amount ?? 0));
  const overall = budgets.find((b) => b.categoryId === null);
  const catInfo = (c: (typeof categories)[number]) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color });
  const budgeted = budgets.filter((b) => b.categoryId !== null);

  const categoryLines = budgeted
    .map((b) => {
      const c = categories.find((x) => x.id === b.categoryId);
      return c ? line(b.id, catInfo(c), toMoneyString(b.amount), spentBy.get(c.id) ?? "0.00") : null;
    })
    .filter((l): l is BudgetLineDTO => l !== null)
    .sort((a, b) => Number(b.percent) - Number(a.percent));

  const unbudgeted = categories
    .filter((c) => !budgeted.some((b) => b.categoryId === c.id) && money(spentBy.get(c.id) ?? 0).gt(0))
    .map((c) => line(null, catInfo(c), null, spentBy.get(c.id)!))
    .sort((a, b) => money(b.spent).cmp(money(a.spent)));

  return {
    month,
    currency: cur,
    currencies,
    overall: line(overall?.id ?? null, null, overall ? toMoneyString(overall.amount) : null, toMoneyString(totalSpent)),
    categories: categoryLines,
    unbudgeted,
    totalSpent: toMoneyString(totalSpent),
    categoryBudgetTotal: toMoneyString(sumMoney(budgeted.map((b) => b.amount))),
    hasPreviousMonthBudgets: previousCount > 0,
  };
}

/** Creates or replaces the budget for one month / category / currency. */
export async function setBudget(userId: string, input: BudgetInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (input.categoryId) {
      const category = await tx.category.findFirst({ where: { id: input.categoryId, userId } });
      if (!category) throw new NotFoundError("Category");
      if (category.type !== "EXPENSE" || category.isSystem) throw new DomainError("Budgets are for expense categories.", "CATEGORY_TYPE");
    }
    const where = { userId, year: input.year, month: input.month, currency: input.currency, categoryId: input.categoryId ?? null };
    const existing = await tx.budget.findFirst({ where });
    const budget = existing
      ? await tx.budget.update({ where: { id: existing.id }, data: { amount: input.amount } })
      : await tx.budget.create({ data: { ...where, amount: input.amount } });
    await writeAudit(tx, { userId, action: "BUDGET_SET", entityType: "Budget", entityId: budget.id, metadata: { amount: input.amount, month: `${input.year}-${input.month}` } });
  });
}

export async function deleteBudget(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.budget.deleteMany({ where: { id, userId } });
    if (result.count !== 1) throw new NotFoundError("Budget");
    await writeAudit(tx, { userId, action: "BUDGET_DELETED", entityType: "Budget", entityId: id });
  });
}

/** Copies last month's budgets into `month`, skipping ones already set. */
export async function copyBudgetsFromPreviousMonth(userId: string, month: YearMonth): Promise<number> {
  const previous = shiftYearMonth(month, -1);
  return prisma.$transaction(async (tx) => {
    const source = await tx.budget.findMany({ where: { userId, year: previous.year, month: previous.month } });
    let copied = 0;
    for (const b of source) {
      const exists = await tx.budget.findFirst({
        where: { userId, year: month.year, month: month.month, currency: b.currency, categoryId: b.categoryId },
      });
      if (exists) continue;
      await tx.budget.create({ data: { userId, year: month.year, month: month.month, currency: b.currency, categoryId: b.categoryId, amount: b.amount } });
      copied++;
    }
    await writeAudit(tx, { userId, action: "BUDGETS_COPIED", entityType: "Budget", entityId: `${month.year}-${month.month}`, metadata: { copied } });
    return copied;
  });
}
