/**
 * Cash-flow indicators (SPEC §13, §14, §37). Pure: every date, including
 * "today", is passed in. All figures are informational, never advice.
 */
import { daysBetween, type LocalDate } from "./dates";
import { money, percentage, sumMoney, type FinDecimal, type MoneyLike } from "./money";

export type Obligation = { dueDate: LocalDate; amount: MoneyLike };
export type PlannedFlow = { date: LocalDate; amount: MoneyLike };

export type SafeToSpend = {
  amount: FinDecimal;
  /** Payments due up to and including this date are reserved. */
  horizonDate: LocalDate;
  /** Why the horizon was chosen (SPEC §13). */
  basis: "NEXT_INCOME" | "MONTH_END";
  obligationsTotal: FinDecimal;
  obligationCount: number;
  nextIncome: PlannedFlow | null;
  isShort: boolean;
};

const onOrBefore = (a: LocalDate, b: LocalDate) => daysBetween(a, b) >= 0;

/**
 * available balance − mandatory payments due before the next expected
 * income; without expected income, − remaining payments of the month.
 * Overdue payments are always included: they are still owed.
 */
export function safeToSpend(input: {
  balance: MoneyLike;
  obligations: readonly Obligation[];
  expectedIncome: readonly PlannedFlow[];
  today: LocalDate;
  monthEnd: LocalDate;
}): SafeToSpend {
  const upcomingIncome = input.expectedIncome
    .filter((i) => onOrBefore(input.today, i.date))
    .sort((a, b) => daysBetween(b.date, a.date));
  const nextIncome = upcomingIncome[0] ?? null;
  const horizonDate = nextIncome ? nextIncome.date : input.monthEnd;
  const due = input.obligations.filter((o) => onOrBefore(o.dueDate, horizonDate));
  const obligationsTotal = sumMoney(due.map((o) => o.amount));
  const amount = money(input.balance).minus(obligationsTotal);
  return {
    amount,
    horizonDate,
    basis: nextIncome ? "NEXT_INCOME" : "MONTH_END",
    obligationsTotal,
    obligationCount: due.length,
    nextIncome,
    isShort: amount.lt(0),
  };
}

/**
 * current balance + expected income − planned expenses − scheduled debt
 * payments = projected balance, over flows dated up to `until` (SPEC §14).
 * A projection, never a guarantee.
 */
export function projectedBalance(input: {
  balance: MoneyLike;
  expectedIncome: readonly PlannedFlow[];
  plannedExpenses: readonly PlannedFlow[];
  obligations: readonly Obligation[];
  until: LocalDate;
}) {
  const within = <T extends { date: LocalDate }>(rows: readonly T[]) => rows.filter((r) => onOrBefore(r.date, input.until));
  const expectedIncomeTotal = sumMoney(within(input.expectedIncome).map((i) => i.amount));
  const plannedExpensesTotal = sumMoney(within(input.plannedExpenses).map((e) => e.amount));
  const obligationsTotal = sumMoney(input.obligations.filter((o) => onOrBefore(o.dueDate, input.until)).map((o) => o.amount));
  return {
    expectedIncomeTotal,
    plannedExpensesTotal,
    obligationsTotal,
    projected: money(input.balance).plus(expectedIncomeTotal).minus(plannedExpensesTotal).minus(obligationsTotal),
  };
}

/** Change versus the previous month; no percentage when it was zero. */
export function monthChange(current: MoneyLike, previous: MoneyLike) {
  const now = money(current);
  const before = money(previous);
  const delta = now.minus(before);
  return { delta, percent: percentage(delta, before) };
}

/** Monthly debt payments / monthly actual income × 100; null (N/A) without income. */
export function debtToIncomeRatio(debtPayments: MoneyLike, income: MoneyLike): FinDecimal | null {
  return percentage(debtPayments, income);
}
