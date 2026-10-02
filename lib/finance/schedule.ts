/**
 * Shared schedule types and primitives for the debt engine
 * (docs/debt-engine.md §1). Pure: no I/O, no clock.
 */
import { addMonthsClamped, daysBetween, makeLocalDate, parseLocalDate, isLeapYear, type LocalDate } from "./dates";
import { money, roundMoney, sumMoney, ZERO, type FinDecimal, type MoneyLike } from "./money";

export type DayCountConvention = "MONTHLY_30_360" | "ACTUAL_365" | "ACTUAL_360" | "ACTUAL_ACTUAL";
export type RepaymentType = "DIFFERENTIAL" | "ANNUITY" | "INTEREST_FREE" | "MANUAL" | "CUSTOM";

export type ScheduleLine = {
  installmentNumber: number;
  dueDate: LocalDate;
  openingPrincipal: FinDecimal;
  principal: FinDecimal;
  interest: FinDecimal;
  fees: FinDecimal;
  total: FinDecimal;
  closingPrincipal: FinDecimal;
};

/** Common inputs for generated (interest-bearing) schedules. */
export type GeneratedTerms = {
  /** Principal to amortise over these lines. */
  principal: MoneyLike;
  annualRatePercent: MoneyLike;
  /** Interest accrues from here to the first due date. */
  periodStart: LocalDate;
  firstDueDate: LocalDate;
  /** Day of month for later due dates (defaults to the first due date's day). */
  paymentDay?: number;
  dayCount?: DayCountConvention;
  /** Decimal places lines are rounded to (2 = tiyin, 0 = whole sums). */
  roundingScale?: number;
  firstInstallmentNumber?: number;
  /** Extra fee per line by index (e.g. an origination fee on line 0). */
  lineFees?: MoneyLike[];
};

/** Upper bound on generated lines (50 years of monthly payments). */
export const MAX_LINES = 600;

export function dueDates(firstDueDate: LocalDate, count: number, paymentDay?: number): LocalDate[] {
  const day = paymentDay ?? parseLocalDate(firstDueDate).day;
  return Array.from({ length: count }, (_, i) => (i === 0 ? firstDueDate : addMonthsClamped(firstDueDate, i, day)));
}

export function nthDueDate(firstDueDate: LocalDate, index: number, paymentDay?: number): LocalDate {
  if (index === 0) return firstDueDate;
  return addMonthsClamped(firstDueDate, index, paymentDay ?? parseLocalDate(firstDueDate).day);
}

/** Interest rate for one period, unrounded. `annualPercent` is e.g. "24" for 24%. */
export function periodRate(
  annualPercent: MoneyLike,
  from: LocalDate,
  to: LocalDate,
  convention: DayCountConvention = "MONTHLY_30_360",
): FinDecimal {
  const annual = money(annualPercent).div(100);
  switch (convention) {
    case "MONTHLY_30_360":
      return annual.div(12);
    case "ACTUAL_365":
      return annual.times(daysBetween(from, to)).div(365);
    case "ACTUAL_360":
      return annual.times(daysBetween(from, to)).div(360);
    case "ACTUAL_ACTUAL": {
      // Split the period at each 1 January and weight by that year's length.
      let rate = ZERO;
      let cursor = from;
      while (daysBetween(cursor, to) > 0) {
        const { year } = parseLocalDate(cursor);
        const nextYear = makeLocalDate(year + 1, 1, 1);
        const segmentEnd = daysBetween(nextYear, to) > 0 ? nextYear : to;
        rate = rate.plus(annual.times(daysBetween(cursor, segmentEnd)).div(isLeapYear(year) ? 366 : 365));
        cursor = segmentEnd;
      }
      return rate;
    }
  }
}

export function makeLine(fields: {
  installmentNumber: number;
  dueDate: LocalDate;
  openingPrincipal: MoneyLike;
  principal: MoneyLike;
  interest?: MoneyLike;
  fees?: MoneyLike;
}): ScheduleLine {
  const openingPrincipal = money(fields.openingPrincipal);
  const principal = money(fields.principal);
  const interest = money(fields.interest ?? 0);
  const fees = money(fields.fees ?? 0);
  return {
    installmentNumber: fields.installmentNumber,
    dueDate: fields.dueDate,
    openingPrincipal,
    principal,
    interest,
    fees,
    total: principal.plus(interest).plus(fees),
    closingPrincipal: openingPrincipal.minus(principal),
  };
}

export function lineFee(terms: Pick<GeneratedTerms, "lineFees" | "roundingScale">, index: number): FinDecimal {
  const fee = terms.lineFees?.[index];
  return fee === undefined ? ZERO : roundMoney(fee, terms.roundingScale ?? 2);
}

export function scheduleTotals(lines: readonly ScheduleLine[]) {
  return {
    principal: sumMoney(lines.map((l) => l.principal)),
    interest: sumMoney(lines.map((l) => l.interest)),
    fees: sumMoney(lines.map((l) => l.fees)),
    total: sumMoney(lines.map((l) => l.total)),
  };
}

/**
 * Structural checks run before any schedule is persisted. Returns a list of
 * problems (empty when valid).
 */
export function validateSchedule(lines: readonly ScheduleLine[], expectedPrincipal: MoneyLike): string[] {
  const errors: string[] = [];
  const expected = money(expectedPrincipal);
  const totals = scheduleTotals(lines);
  if (!totals.principal.equals(expected)) {
    errors.push(`Сумма основного долга ${totals.principal.toFixed(2)}, а должна быть ${expected.toFixed(2)}`);
  }
  lines.forEach((line, i) => {
    const n = line.installmentNumber;
    if (line.principal.isNegative() || line.interest.isNegative() || line.fees.isNegative()) errors.push(`Строка ${n}: отрицательная сумма`);
    if (line.closingPrincipal.isNegative()) errors.push(`Строка ${n}: остаток уходит ниже нуля`);
    if (!line.closingPrincipal.equals(line.openingPrincipal.minus(line.principal))) errors.push(`Строка ${n}: остаток после платежа не сходится`);
    if (!line.total.equals(line.principal.plus(line.interest).plus(line.fees))) errors.push(`Строка ${n}: итог не сходится`);
    const prev = lines[i - 1];
    if (prev) {
      if (daysBetween(prev.dueDate, line.dueDate) <= 0) errors.push(`Строка ${n}: дата должна быть позже предыдущей`);
      if (!prev.closingPrincipal.equals(line.openingPrincipal)) errors.push(`Строка ${n} не продолжает строку ${prev.installmentNumber}`);
    }
  });
  const last = lines.at(-1);
  if (last && !last.closingPrincipal.isZero()) errors.push("Последняя строка не гасит долг до нуля");
  return errors;
}

/** Re-chains opening/closing principal after lines were edited or trimmed. */
export function rechain(
  lines: readonly Omit<ScheduleLine, "openingPrincipal" | "closingPrincipal" | "total">[],
  principal: MoneyLike,
  firstInstallmentNumber = lines[0]?.installmentNumber ?? 1,
): ScheduleLine[] {
  let opening = money(principal);
  return lines.map((line, i) => {
    const made = makeLine({ ...line, installmentNumber: firstInstallmentNumber + i, openingPrincipal: opening });
    opening = made.closingPrincipal;
    return made;
  });
}
