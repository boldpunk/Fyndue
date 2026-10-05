import { parseLocalDate, type LocalDate } from "./dates";
import { FinDecimal, money, percentage, toMoneyString, ZERO, type MoneyLike } from "./money";

export type GoalState = "achieved" | "on-track" | "no-date" | "overdue";

export type GoalProgress = {
  saved: string;
  remaining: string;
  /** 0–100, one decimal; capped at 100. */
  percent: string;
  /** Whole months until the target date (at least 1 while it is ahead); null without a date. */
  monthsLeft: number | null;
  /** What to put aside each month to make it, rounded up to the tiyin; null when done or no date. */
  perMonth: string | null;
  state: GoalState;
};

/** Calendar months from `from` to `to`, counting a started month: 5 Oct → 1 Mar = 5. */
export function monthsUntil(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  const months = (b.year - a.year) * 12 + (b.month - a.month) + (b.day > a.day ? 1 : 0);
  return Math.max(0, months);
}

export function goalProgress(input: { target: MoneyLike; saved: MoneyLike; today: LocalDate; targetDate: LocalDate | null }): GoalProgress {
  const target = money(input.target);
  const saved = FinDecimal.max(money(input.saved), ZERO);
  const remaining = FinDecimal.max(target.minus(saved), ZERO);
  const percent = FinDecimal.min(percentage(saved, target) ?? ZERO, 100).toDecimalPlaces(1, FinDecimal.ROUND_DOWN).toFixed(1);
  const base = { saved: toMoneyString(saved), remaining: toMoneyString(remaining), percent };

  if (remaining.isZero()) return { ...base, monthsLeft: null, perMonth: null, state: "achieved" };
  if (!input.targetDate) return { ...base, monthsLeft: null, perMonth: null, state: "no-date" };
  if (input.targetDate <= input.today) return { ...base, monthsLeft: 0, perMonth: toMoneyString(remaining), state: "overdue" };
  const monthsLeft = Math.max(1, monthsUntil(input.today, input.targetDate));
  const perMonth = remaining.div(monthsLeft).toDecimalPlaces(2, FinDecimal.ROUND_UP);
  return { ...base, monthsLeft, perMonth: toMoneyString(perMonth), state: "on-track" };
}
