import "server-only";
import { rollUpToParents } from "@/lib/categories/tree";
import { prisma } from "@/lib/db";
import { debtToIncomeRatio } from "@/lib/finance/cash-flow";
import { debtCost } from "@/lib/finance/debt-cost";
import { addDays, addMonthsClamped, daysBetween, formatYearMonth, localDateToDb, makeLocalDate, monthBounds, parseLocalDate, todayIn, type LocalDate, type YearMonth } from "@/lib/finance/dates";
import { money, percentage, sumMoney, toMoneyString, ZERO, type FinDecimal } from "@/lib/finance/money";
import type { Currency } from "@/lib/generated/prisma/client";
import { listDebts } from "./debts";

export type CategoryShare = { id: string | null; name: string; icon: string | null; color: string | null; amount: string; share: string };

/** Keeps the first `max − 1` rows and folds the rest into one "Other" row, in exact decimals. */
function foldTail(rows: CategoryShare[], total: FinDecimal, max = 8): CategoryShare[] {
  if (rows.length <= max) return rows;
  const head = rows.slice(0, max - 1);
  const tail = rows.slice(max - 1);
  const amount = sumMoney(tail.map((r) => r.amount));
  return [
    ...head,
    {
      id: "other",
      name: `Другое (${tail.length})`,
      icon: null,
      color: null,
      amount: toMoneyString(amount),
      share: (percentage(amount, total) ?? ZERO).toDecimalPlaces(1).toFixed(1),
    },
  ];
}

export type SeriesPoint = { key: string; income: string; expenses: string; debtPayments: string; net: string };

export type AnalyticsDTO = {
  from: LocalDate;
  to: LocalDate;
  currency: Currency;
  currencies: Currency[];
  totals: { income: string; expenses: string; debtPayments: string; net: string; debtToIncome: string | null };
  byCategory: CategoryShare[];
  /** Top categories with the tail folded into "Other" (for charts). */
  byCategoryTop: CategoryShare[];
  /** One point per month in range. */
  monthly: SeriesPoint[];
  /** One point per day, only for ranges up to ~2 months. */
  daily: { key: string; expenses: string }[] | null;
  debt: {
    principalBasis: string;
    principalPaid: string;
    principalRemaining: string;
    interestPaid: string;
    interestRemainingEstimate: string;
    penaltiesPaid: string;
    feesPaid: string;
    costAbovePrincipal: string;
    cashOutflow: string;
    monthlyPayments: { key: string; principal: string; interest: string; fees: string }[];
    debts: { id: string; name: string; paidPercent: string; currentPrincipal: string; projectedPayoffDate: string | null; status: string }[];
  };
};

async function currenciesFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } });
  const accounts = await prisma.account.findMany({ where: { userId }, select: { currency: true }, distinct: ["currency"] });
  const debts = await prisma.debt.findMany({ where: { userId }, select: { currency: true }, distinct: ["currency"] });
  return { base: user.baseCurrency, all: [...new Set<Currency>([user.baseCurrency, ...accounts.map((a) => a.currency), ...debts.map((d) => d.currency)])] };
}

function monthKeys(from: LocalDate, to: LocalDate): string[] {
  const keys: string[] = [];
  const { year, month } = parseLocalDate(from);
  let cursor = makeLocalDate(year, month, 1);
  while (daysBetween(cursor, to) >= 0 && keys.length < 240) {
    keys.push(cursor.slice(0, 7));
    cursor = addMonthsClamped(cursor, 1);
  }
  return keys;
}

type FlowRow = { key: string; type: string; total: FinDecimal };

async function flowsBy(userId: string, currency: Currency, from: LocalDate, to: LocalDate, unit: "month" | "day"): Promise<FlowRow[]> {
  const fmt = unit === "month" ? "YYYY-MM" : "YYYY-MM-DD";
  const rows = await prisma.$queryRaw<{ key: string; type: string; total: string }[]>`
    SELECT to_char("transactionDate", ${fmt}) AS key, "type"::text AS type, SUM("amount")::text AS total
    FROM "Transaction"
    WHERE "userId" = ${userId}
      AND "currency" = ${currency}::"Currency"
      AND "voidedAt" IS NULL
      AND "status" = 'ACTUAL'
      AND "type" IN ('INCOME', 'EXPENSE', 'DEBT_PAYMENT')
      AND "transactionDate" BETWEEN ${localDateToDb(from)} AND ${localDateToDb(to)}
    GROUP BY 1, 2`;
  return rows.map((r) => ({ key: r.key, type: r.type, total: money(r.total) }));
}

function pick(rows: FlowRow[], key: string, type: string) {
  return rows.find((r) => r.key === key && r.type === type)?.total ?? ZERO;
}

/**
 * Analytics for a date range and one currency (SPEC §36). Transfers are never
 * income or spending; debt payments are counted separately at their real
 * debit, so card fees are not double-counted as expenses.
 */
export async function getAnalytics(userId: string, input: { from: LocalDate; to: LocalDate; currency?: Currency }): Promise<AnalyticsDTO> {
  const { base, all } = await currenciesFor(userId);
  const currency = input.currency && all.includes(input.currency) ? input.currency : base;
  const range = { gte: localDateToDb(input.from), lte: localDateToDb(input.to) };
  const days = daysBetween(input.from, input.to) + 1;

  const [monthlyRows, dailyRows, categoryRows, categories, debts, payments] = await Promise.all([
    flowsBy(userId, currency, input.from, input.to, "month"),
    days <= 62 ? flowsBy(userId, currency, input.from, input.to, "day") : Promise.resolve(null),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, currency, type: "EXPENSE", status: "ACTUAL", voidedAt: null, transactionDate: range },
      _sum: { amount: true },
    }),
    prisma.category.findMany({ where: { userId, type: "EXPENSE" }, select: { id: true, name: true, icon: true, color: true, parentId: true } }),
    listDebts(userId, "active").then(async (active) => [...active, ...(await listDebts(userId, "paid"))]),
    prisma.debtPayment.findMany({
      where: { userId, reversedAt: null, debt: { currency, status: { not: "ARCHIVED" } } },
      select: {
        paymentDate: true,
        principalAmount: true,
        interestAmount: true,
        originationFeeAmount: true,
        paymentProcessingFeeAmount: true,
        penaltyAmount: true,
        otherFeeAmount: true,
        actualAccountDebit: true,
      },
    }),
  ]);

  const keys = monthKeys(input.from, input.to);
  const series = (key: string, rows: FlowRow[]): SeriesPoint => {
    const income = pick(rows, key, "INCOME");
    const expenses = pick(rows, key, "EXPENSE");
    const debtPayments = pick(rows, key, "DEBT_PAYMENT");
    return {
      key,
      income: toMoneyString(income),
      expenses: toMoneyString(expenses),
      debtPayments: toMoneyString(debtPayments),
      net: toMoneyString(income.minus(expenses).minus(debtPayments)),
    };
  };
  const monthly = keys.map((k) => series(k, monthlyRows));
  const income = sumMoney(monthly.map((m) => m.income));
  const expenses = sumMoney(monthly.map((m) => m.expenses));
  const debtPayments = sumMoney(monthly.map((m) => m.debtPayments));

  const totalCat = sumMoney(categoryRows.map((r) => r._sum.amount ?? 0));
  // Subcategories count towards their parent («Парковка» → «Автомобиль»).
  const rolled = rollUpToParents(
    categoryRows.map((r) => ({ categoryId: r.categoryId, amount: r._sum.amount ?? 0 })),
    categories,
  );
  const byCategory = [...rolled]
    .map(([categoryId, amount]) => {
      const c = categories.find((x) => x.id === categoryId);
      return {
        id: categoryId,
        name: c?.name ?? "Uncategorised",
        icon: c?.icon ?? null,
        color: c?.color ?? null,
        amount: toMoneyString(amount),
        share: (percentage(amount, totalCat) ?? ZERO).toDecimalPlaces(1).toFixed(1),
      };
    })
    .sort((a, b) => money(b.amount).cmp(money(a.amount)));

  let daily: AnalyticsDTO["daily"] = null;
  if (dailyRows) {
    daily = [];
    for (let d = input.from; daysBetween(d, input.to) >= 0; d = addDays(d, 1)) {
      daily.push({ key: d, expenses: toMoneyString(pick(dailyRows, d, "EXPENSE")) });
    }
  }

  const currencyDebts = debts.filter((d) => d.currency === currency);
  const cost = debtCost(
    payments.map((p) => ({
      principal: p.principalAmount,
      interest: p.interestAmount,
      originationFee: p.originationFeeAmount,
      processingFee: p.paymentProcessingFeeAmount,
      penalty: p.penaltyAmount,
      otherFee: p.otherFeeAmount,
      actualAccountDebit: p.actualAccountDebit,
    })),
  );
  const inRange = payments.filter((p) => p.paymentDate >= range.gte && p.paymentDate <= range.lte);
  const monthlyPayments = keys.map((key) => {
    const rows = inRange.filter((p) => formatYearMonth({ year: p.paymentDate.getUTCFullYear(), month: p.paymentDate.getUTCMonth() + 1 }) === key);
    return {
      key,
      principal: toMoneyString(sumMoney(rows.map((p) => p.principalAmount))),
      interest: toMoneyString(sumMoney(rows.map((p) => p.interestAmount))),
      fees: toMoneyString(
        sumMoney(rows.flatMap((p) => [p.originationFeeAmount, p.paymentProcessingFeeAmount, p.penaltyAmount, p.otherFeeAmount])),
      ),
    };
  });
  const dti = debtToIncomeRatio(debtPayments, income);

  return {
    from: input.from,
    to: input.to,
    currency,
    currencies: all,
    totals: {
      income: toMoneyString(income),
      expenses: toMoneyString(expenses),
      debtPayments: toMoneyString(debtPayments),
      net: toMoneyString(income.minus(expenses).minus(debtPayments)),
      debtToIncome: dti ? dti.toDecimalPlaces(1).toFixed(1) : null,
    },
    byCategory,
    byCategoryTop: foldTail(byCategory, totalCat),
    monthly,
    daily,
    debt: {
      principalBasis: toMoneyString(sumMoney(currencyDebts.map((d) => d.principalBasis))),
      principalPaid: toMoneyString(sumMoney(currencyDebts.map((d) => d.paidPrincipal))),
      principalRemaining: toMoneyString(sumMoney(currencyDebts.map((d) => d.currentPrincipal))),
      interestPaid: toMoneyString(cost.interestPaid),
      interestRemainingEstimate: toMoneyString(sumMoney(currencyDebts.map((d) => d.remainingInterestEstimate))),
      penaltiesPaid: toMoneyString(cost.penaltiesPaid),
      feesPaid: toMoneyString(cost.feesPaid),
      costAbovePrincipal: toMoneyString(cost.costAbovePrincipal),
      cashOutflow: toMoneyString(cost.cashOutflow),
      monthlyPayments,
      debts: currencyDebts.map((d) => ({
        id: d.id,
        name: d.name,
        paidPercent: d.paidPercent,
        currentPrincipal: d.currentPrincipal,
        projectedPayoffDate: d.projectedPayoffDate,
        status: d.status,
      })),
    },
  };
}

export type MonthlySummaryDTO = {
  month: YearMonth;
  currency: Currency;
  income: string;
  expenses: string;
  debtPayments: string;
  netCashFlow: string;
  /** Principal repaid during the month (debt reduction). */
  debtReduction: string;
  largestExpenseCategory: { name: string; amount: string } | null;
  totalRemainingDebt: string;
  endingBalance: string;
  isCurrentMonth: boolean;
};

/**
 * SPEC §39. Every figure is recomputed from source rows, so a past month's
 * summary is always reproducible: ending balance = opening balances +
 * actual flows dated before the month ended; remaining debt = basis −
 * paid-before-tracking − principal of non-reversed payments up to then.
 */
export async function getMonthlySummary(userId: string, month: YearMonth, currency?: Currency): Promise<MonthlySummaryDTO> {
  const { base, all } = await currenciesFor(userId);
  const cur = currency && all.includes(currency) ? currency : base;
  const bounds = monthBounds(month);
  const monthEnd = addDays(bounds.endExclusive, -1);
  const endInstant = localDateToDb(bounds.endExclusive);
  const range = { gte: localDateToDb(bounds.start), lt: endInstant };

  const [flows, topCategory, principal, accounts, balanceFlows, debts, paidToDate, user] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["type"],
      where: { userId, currency: cur, status: "ACTUAL", voidedAt: null, type: { in: ["INCOME", "EXPENSE", "DEBT_PAYMENT"] }, transactionDate: range },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, currency: cur, status: "ACTUAL", voidedAt: null, type: "EXPENSE", transactionDate: range },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 1,
    }),
    prisma.debtPayment.aggregate({
      where: { userId, reversedAt: null, paymentDate: range, debt: { currency: cur } },
      _sum: { principalAmount: true },
    }),
    // Accounts that existed by the end of the month, counted in totals.
    prisma.account.findMany({ where: { userId, currency: cur, includeInTotal: true, createdAt: { lt: endInstant } }, select: { id: true, openingBalance: true } }),
    prisma.transaction.groupBy({
      by: ["direction"],
      where: { userId, currency: cur, status: "ACTUAL", voidedAt: null, transactionDate: { lt: endInstant }, account: { includeInTotal: true, createdAt: { lt: endInstant } } },
      _sum: { amount: true },
    }),
    prisma.debt.findMany({ where: { userId, currency: cur, status: { not: "ARCHIVED" }, startDate: { lt: endInstant } }, select: { id: true, principalBasis: true, paidBeforeTracking: true } }),
    prisma.debtPayment.groupBy({
      by: ["debtId"],
      where: { userId, reversedAt: null, paymentDate: { lt: endInstant }, debt: { currency: cur } },
      _sum: { principalAmount: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }),
  ]);

  const sumOf = (type: string) => money(flows.find((f) => f.type === type)?._sum.amount ?? 0);
  const income = sumOf("INCOME");
  const expenses = sumOf("EXPENSE");
  const debtPayments = sumOf("DEBT_PAYMENT");
  const top = topCategory[0];
  const topName = top?.categoryId ? (await prisma.category.findFirst({ where: { id: top.categoryId, userId }, select: { name: true } }))?.name : null;
  const inflow = money(balanceFlows.find((f) => f.direction === "INFLOW")?._sum.amount ?? 0);
  const outflow = money(balanceFlows.find((f) => f.direction === "OUTFLOW")?._sum.amount ?? 0);
  const remainingDebt = sumMoney(
    debts.map((d) => {
      const paid = paidToDate.find((p) => p.debtId === d.id)?._sum.principalAmount ?? 0;
      return money(d.principalBasis).minus(money(d.paidBeforeTracking)).minus(money(paid));
    }),
  );
  const today = todayIn(user.timezone);

  return {
    month,
    currency: cur,
    income: toMoneyString(income),
    expenses: toMoneyString(expenses),
    debtPayments: toMoneyString(debtPayments),
    netCashFlow: toMoneyString(income.minus(expenses).minus(debtPayments)),
    debtReduction: toMoneyString(principal._sum.principalAmount ?? 0),
    largestExpenseCategory: top ? { name: topName ?? "Uncategorised", amount: toMoneyString(top._sum.amount ?? 0) } : null,
    totalRemainingDebt: toMoneyString(remainingDebt),
    endingBalance: toMoneyString(sumMoney(accounts.map((a) => a.openingBalance)).plus(inflow).minus(outflow)),
    isCurrentMonth: today >= bounds.start && today <= monthEnd,
  };
}
