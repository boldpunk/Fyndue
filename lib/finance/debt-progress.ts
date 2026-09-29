/**
 * Debt progress (SPEC §11):
 *   paid_percentage = paid_principal / principal_basis × 100
 * where paid principal includes principal repaid before Fyndue tracked it.
 */
import { daysBetween, type LocalDate } from "./dates";
import { money, percentage, sumMoney, ZERO, type FinDecimal, type MoneyLike } from "./money";
import { isOpenItemStatus, type StoredItemStatus } from "./payment-status";

export type ProgressItem = {
  dueDate: LocalDate;
  status: StoredItemStatus;
  plannedPrincipal: MoneyLike;
  plannedInterest: MoneyLike;
  plannedFees: MoneyLike;
  plannedTotal: MoneyLike;
  paidPrincipal: MoneyLike;
  paidInterest: MoneyLike;
  paidFees: MoneyLike;
  paidTotal: MoneyLike;
};

export type DebtProgress = {
  principalBasis: FinDecimal;
  paidPrincipal: FinDecimal;
  remainingPrincipal: FinDecimal;
  paidPercent: FinDecimal;
  remainingPercent: FinDecimal;
  paymentsCompleted: number;
  paymentsRemaining: number;
  nextPayment: { dueDate: LocalDate; amountDue: FinDecimal; daysUntil: number; index: number } | null;
  projectedPayoffDate: LocalDate | null;
  /** Interest still expected on open lines (an estimate unless bank-confirmed). */
  remainingInterestEstimate: FinDecimal;
  /** Everything still planned: principal + interest + fees on open lines. */
  plannedFutureTotal: FinDecimal;
};

export function debtProgress(input: {
  principalBasis: MoneyLike;
  currentPrincipal: MoneyLike;
  /** Current schedule, ordered by due date. */
  items: readonly ProgressItem[];
  today: LocalDate;
}): DebtProgress {
  const basis = money(input.principalBasis);
  const remainingPrincipal = money(input.currentPrincipal);
  const paidPrincipal = basis.minus(remainingPrincipal);
  const paidPercent = percentage(paidPrincipal, basis) ?? ZERO;
  const remainingPercent = basis.isZero() ? ZERO : money(100).minus(paidPercent);

  const open = input.items.map((item, index) => ({ item, index })).filter(({ item }) => isOpenItemStatus(item.status));
  const next = open[0];
  const owed = (item: ProgressItem) => money(item.plannedTotal).minus(money(item.paidTotal));

  return {
    principalBasis: basis,
    paidPrincipal,
    remainingPrincipal,
    paidPercent,
    remainingPercent,
    paymentsCompleted: input.items.filter((i) => i.status === "PAID").length,
    paymentsRemaining: open.length,
    nextPayment: next
      ? { dueDate: next.item.dueDate, amountDue: owed(next.item), daysUntil: daysBetween(input.today, next.item.dueDate), index: next.index }
      : null,
    projectedPayoffDate: remainingPrincipal.gt(0) || open.length ? (open.at(-1)?.item.dueDate ?? null) : null,
    remainingInterestEstimate: sumMoney(open.map(({ item }) => {
      const left = money(item.plannedInterest).minus(money(item.paidInterest));
      return left.isNegative() ? ZERO : left;
    })),
    plannedFutureTotal: sumMoney(open.map(({ item }) => owed(item))),
  };
}
