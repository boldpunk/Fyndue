import "server-only";
import { prisma } from "@/lib/db";
import { totalsByCurrency } from "@/lib/finance/balance";
import { localDateToDb, monthBounds, type YearMonth } from "@/lib/finance/dates";
import { toMoneyString } from "@/lib/finance/money";

export type CurrencyTotals = { currency: string; amount: string }[];

export type MonthOverview = {
  balances: CurrencyTotals;
  income: CurrencyTotals;
  expenses: CurrencyTotals;
  expectedIncome: CurrencyTotals;
  /** Real account debits for debt payments (incl. card fees), per currency. */
  debtPayments: CurrencyTotals;
  accountCount: number;
};

/**
 * Phase 1 dashboard numbers, straight from source rows. Totals are grouped
 * per currency and never converted.
 */
export async function getMonthOverview(userId: string, month: YearMonth): Promise<MonthOverview> {
  const bounds = monthBounds(month);
  const dateRange = { gte: localDateToDb(bounds.start), lt: localDateToDb(bounds.endExclusive) };

  const [accounts, flows] = await Promise.all([
    prisma.account.findMany({
      where: { userId, isArchived: false },
      select: { currency: true, currentBalance: true, includeInTotal: true, isArchived: true },
    }),
    prisma.transaction.groupBy({
      by: ["type", "status", "currency"],
      where: { userId, voidedAt: null, type: { in: ["INCOME", "EXPENSE", "DEBT_PAYMENT"] }, transactionDate: dateRange },
      _sum: { amount: true },
    }),
  ]);

  const pick = (type: "INCOME" | "EXPENSE" | "DEBT_PAYMENT", status: "ACTUAL" | "EXPECTED"): CurrencyTotals =>
    flows
      .filter((f) => f.type === type && f.status === status)
      .map((f) => ({ currency: f.currency, amount: toMoneyString(f._sum.amount ?? 0) }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    balances: [...totalsByCurrency(accounts)].map(([currency, amount]) => ({ currency, amount: toMoneyString(amount) })),
    income: pick("INCOME", "ACTUAL"),
    expenses: pick("EXPENSE", "ACTUAL"),
    expectedIncome: pick("INCOME", "EXPECTED"),
    debtPayments: pick("DEBT_PAYMENT", "ACTUAL"),
    accountCount: accounts.length,
  };
}
