import "server-only";
import { prisma } from "@/lib/db";
import { totalsByCurrency } from "@/lib/finance/balance";
import { debtToIncomeRatio, monthChange, projectedBalance, safeToSpend } from "@/lib/finance/cash-flow";
import { combineInBase, type RateRow } from "@/lib/finance/fx";
import {
  addDays,
  dbToLocalDate,
  localDateToDb,
  monthBounds,
  shiftYearMonth,
  todayIn,
  yearMonthOf,
  type YearMonth,
} from "@/lib/finance/dates";
import { money, toMoneyString, type FinDecimal } from "@/lib/finance/money";
import { listAccounts, type AccountDTO } from "./accounts";
import { debtTotalsByCurrency, listDebts, listUpcomingPayments, type DebtTotalsDTO, type UpcomingPaymentDTO } from "./debts";
import { ratesForUser } from "./central-bank-rates";
import { listOccurrences } from "./recurring";
import { recentTransactions, type TransactionDTO } from "./transactions";

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

// ─── Phase 3: full dashboard ─────────────────────────────────────────────────

export type ChangeDTO = { delta: string; percent: string | null } | null;

export type CurrencyDashboard = {
  currency: string;
  balance: string;
  income: string;
  incomeChange: ChangeDTO;
  expenses: string;
  expensesChange: ChangeDTO;
  debtPayments: string;
  debtPaymentsChange: ChangeDTO;
  expectedIncomeThisMonth: string;
  /** Debt payments ÷ actual income this month × 100; null = N/A (no income). */
  debtToIncome: string | null;
  safeToSpend: {
    amount: string;
    horizonDate: string;
    basis: "NEXT_INCOME" | "MONTH_END";
    obligationsTotal: string;
    obligationCount: number;
    nextIncome: { date: string; amount: string } | null;
    isShort: boolean;
  };
  projected: {
    until: string;
    balance: string;
    expectedIncome: string;
    plannedExpenses: string;
    debtPayments: string;
    projected: string;
  };
};

export type DashboardDTO = {
  today: string;
  month: YearMonth;
  primaryCurrency: string;
  currencies: CurrencyDashboard[];
  accountCount: number;
  upcoming: UpcomingPaymentDTO[];
  overdue: { count: number; totals: CurrencyTotals };
  debtTotals: DebtTotalsDTO[];
  recent: TransactionDTO[];
  accounts: AccountDTO[];
  /** All balances in the primary currency at the Central Bank (or the user's own) rate; null when a rate is missing. */
  combinedBalance: { amount: string; rateDate: string | null } | null;
};

/** Horizon for obligations and expected income considered by Safe to Spend. */
const LOOKAHEAD_DAYS = 120;

/**
 * Everything the dashboard shows, from real rows (SPEC §9–§14). Figures are
 * per currency and never converted; the pure maths lives in lib/finance.
 */
export async function getDashboard(userId: string): Promise<DashboardDTO> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, baseCurrency: true } });
  const today = todayIn(user.timezone);
  const month = yearMonthOf(today);
  const bounds = monthBounds(month);
  const previous = monthBounds(shiftYearMonth(month, -1));
  const monthEnd = addDays(bounds.endExclusive, -1);
  const lookahead = localDateToDb(addDays(today, LOOKAHEAD_DAYS));

  const [accounts, thisMonth, lastMonth, expectedRows, openItems, upcoming, activeDebts, recent, occurrences, rates] = await Promise.all([
    listAccounts(userId),
    flowTotals(userId, bounds.start, bounds.endExclusive),
    flowTotals(userId, previous.start, previous.endExclusive),
    prisma.transaction.findMany({
      where: {
        userId,
        type: "INCOME",
        status: "EXPECTED",
        voidedAt: null,
        transactionDate: { gte: localDateToDb(bounds.start), lte: lookahead },
        account: { includeInTotal: true, isArchived: false },
      },
      select: { transactionDate: true, amount: true, currency: true },
    }),
    prisma.debtScheduleItem.findMany({
      where: { userId, isCurrent: true, status: { in: ["SCHEDULED", "PARTIALLY_PAID"] }, dueDate: { lte: lookahead }, debt: { status: "ACTIVE" } },
      select: { dueDate: true, plannedTotal: true, paidTotal: true, debt: { select: { currency: true } } },
    }),
    listUpcomingPayments(userId, { untilDays: 30 }),
    listDebts(userId, "active"),
    recentTransactions(userId, 6),
    listOccurrences(userId, today, addDays(today, LOOKAHEAD_DAYS)),
    ratesForUser(userId),
  ]);
  // Planned recurring items that have not been recorded yet (from today on).
  const planned = occurrences.filter((o) => o.transactionId === null && o.includeInTotal);

  const balances = totalsByCurrency(accounts);
  const currencies = new Set<string>([...balances.keys(), ...activeDebts.map((d) => d.currency), ...thisMonth.keys()]);
  const primary = user.baseCurrency;

  const obligationsFor = (currency: string) =>
    openItems
      .filter((i) => i.debt.currency === currency)
      .map((i) => ({ dueDate: dbToLocalDate(i.dueDate), amount: money(i.plannedTotal).minus(money(i.paidTotal)) }))
      .filter((o) => o.amount.gt(0));
  const incomeFor = (currency: string) => [
    ...expectedRows.filter((r) => r.currency === currency).map((r) => ({ date: dbToLocalDate(r.transactionDate), amount: r.amount })),
    ...planned.filter((o) => o.kind === "INCOME" && o.currency === currency).map((o) => ({ date: o.date, amount: o.amount })),
  ];
  const plannedExpensesFor = (currency: string) =>
    planned.filter((o) => o.kind === "EXPENSE" && o.currency === currency).map((o) => ({ date: o.date, amount: o.amount }));

  const change = (now: FinDecimal, before: FinDecimal): ChangeDTO => {
    if (before.isZero() && now.isZero()) return null;
    const c = monthChange(now, before);
    return { delta: toMoneyString(c.delta), percent: c.percent ? c.percent.toDecimalPlaces(1).toFixed(1) : null };
  };

  const perCurrency: CurrencyDashboard[] = [...currencies]
    .sort((a, b) => (a === primary ? -1 : b === primary ? 1 : a.localeCompare(b)))
    .map((currency) => {
      const now = thisMonth.get(currency) ?? emptyFlows();
      const before = lastMonth.get(currency) ?? emptyFlows();
      const balance = balances.get(currency) ?? money(0);
      const obligations = obligationsFor(currency);
      const expected = incomeFor(currency);
      const sts = safeToSpend({ balance, obligations, expectedIncome: expected, today, monthEnd });
      const projection = projectedBalance({
        balance,
        expectedIncome: expected.filter((e) => e.date >= bounds.start),
        plannedExpenses: plannedExpensesFor(currency),
        obligations,
        until: monthEnd,
      });
      const dti = debtToIncomeRatio(now.debtPayments, now.income);
      return {
        currency,
        balance: toMoneyString(balance),
        income: toMoneyString(now.income),
        incomeChange: before.hasActivity ? change(now.income, before.income) : null,
        expenses: toMoneyString(now.expenses),
        expensesChange: before.hasActivity ? change(now.expenses, before.expenses) : null,
        debtPayments: toMoneyString(now.debtPayments),
        debtPaymentsChange: before.hasActivity ? change(now.debtPayments, before.debtPayments) : null,
        expectedIncomeThisMonth: toMoneyString(now.expectedIncome),
        debtToIncome: dti ? dti.toDecimalPlaces(1).toFixed(1) : null,
        safeToSpend: {
          amount: toMoneyString(sts.amount),
          horizonDate: sts.horizonDate,
          basis: sts.basis,
          obligationsTotal: toMoneyString(sts.obligationsTotal),
          obligationCount: sts.obligationCount,
          nextIncome: sts.nextIncome ? { date: sts.nextIncome.date, amount: toMoneyString(sts.nextIncome.amount) } : null,
          isShort: sts.isShort,
        },
        projected: {
          until: monthEnd,
          balance: toMoneyString(balance),
          expectedIncome: toMoneyString(projection.expectedIncomeTotal),
          plannedExpenses: toMoneyString(projection.plannedExpensesTotal),
          debtPayments: toMoneyString(projection.obligationsTotal),
          projected: toMoneyString(projection.projected),
        },
      };
    });

  const overdueItems = upcoming.filter((u) => u.displayStatus === "OVERDUE");
  const overdueTotals = new Map<string, FinDecimal>();
  for (const item of overdueItems) {
    overdueTotals.set(item.debt.currency, (overdueTotals.get(item.debt.currency) ?? money(0)).plus(money(item.remainingTotal)));
  }

  return {
    today,
    month,
    primaryCurrency: primary,
    currencies: perCurrency,
    accountCount: accounts.length,
    upcoming: upcoming.slice(0, 6),
    overdue: {
      count: overdueItems.length,
      totals: [...overdueTotals].map(([currency, amount]) => ({ currency, amount: toMoneyString(amount) })),
    },
    debtTotals: debtTotalsByCurrency(activeDebts),
    recent,
    accounts,
    combinedBalance: combinedBalance(perCurrency, primary, rates, today),
  };
}

function combinedBalance(rows: CurrencyDashboard[], base: string, rates: RateRow[], today: string): DashboardDTO["combinedBalance"] {
  if (rows.length < 2) return null;
  const combined = combineInBase(rows.map((r) => ({ currency: r.currency, amount: r.balance })), base, rates, today);
  return combined.total ? { amount: toMoneyString(combined.total), rateDate: combined.oldestRateDate } : null;
}

type Flows = { income: FinDecimal; expenses: FinDecimal; debtPayments: FinDecimal; expectedIncome: FinDecimal; hasActivity: boolean };
const emptyFlows = (): Flows => ({ income: money(0), expenses: money(0), debtPayments: money(0), expectedIncome: money(0), hasActivity: false });

/** Actual income, expenses and debt payments (real debits) per currency in [start, end). */
async function flowTotals(userId: string, start: string, endExclusive: string): Promise<Map<string, Flows>> {
  const rows = await prisma.transaction.groupBy({
    by: ["type", "status", "currency"],
    where: {
      userId,
      voidedAt: null,
      type: { in: ["INCOME", "EXPENSE", "DEBT_PAYMENT"] },
      transactionDate: { gte: localDateToDb(start), lt: localDateToDb(endExclusive) },
    },
    _sum: { amount: true },
  });
  const result = new Map<string, Flows>();
  for (const row of rows) {
    const flows = result.get(row.currency) ?? emptyFlows();
    const amount = money(row._sum.amount ?? 0);
    if (row.type === "INCOME" && row.status === "EXPECTED") flows.expectedIncome = flows.expectedIncome.plus(amount);
    else {
      if (row.type === "INCOME") flows.income = flows.income.plus(amount);
      if (row.type === "EXPENSE") flows.expenses = flows.expenses.plus(amount);
      if (row.type === "DEBT_PAYMENT") flows.debtPayments = flows.debtPayments.plus(amount);
      flows.hasActivity = true;
    }
    result.set(row.currency, flows);
  }
  return result;
}
