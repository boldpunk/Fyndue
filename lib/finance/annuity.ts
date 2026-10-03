/**
 * Annuity repayment (SPEC §18): A = P × r(1+r)^n / ((1+r)^n − 1).
 */
import { adjustDueDate } from "./business-days";
import type { LocalDate } from "./dates";
import { money, roundMoney, type FinDecimal, type MoneyLike } from "./money";
import { lineFee, makeLine, MAX_LINES, lineInterest, nthDueDate, type GeneratedTerms, type ScheduleLine } from "./schedule";

/** Unrounded periodic payment. `monthlyRate` is a fraction (0.01 = 1%). */
export function annuityPayment(principal: MoneyLike, monthlyRate: FinDecimal, periods: number): FinDecimal {
  const p = money(principal);
  if (periods < 1) throw new RangeError("Для аннуитета нужен хотя бы один период");
  if (monthlyRate.isZero()) return p.div(periods);
  const growth = monthlyRate.plus(1).pow(periods);
  return p.times(monthlyRate).times(growth).div(growth.minus(1));
}

export type AnnuityTerms = GeneratedTerms &
  (
    | { count: number; fixedPayment?: undefined }
    /** Keep this payment and let the number of lines follow (reduce term). */
    | { fixedPayment: MoneyLike; count?: undefined }
  );

export function generateAnnuitySchedule(terms: AnnuityTerms): ScheduleLine[] {
  const scale = terms.roundingScale ?? 2;
  const principal = money(terms.principal);
  if (principal.isZero()) return [];
  const monthlyRate = money(terms.annualRatePercent).div(100).div(12);
  const payment =
    terms.fixedPayment !== undefined
      ? roundMoney(terms.fixedPayment, scale)
      : roundMoney(annuityPayment(principal, monthlyRate, terms.count), scale);
  const maxLines = terms.count ?? MAX_LINES;

  const lines: ScheduleLine[] = [];
  let opening = principal;
  let previousDate = terms.periodStart;
  let carried: { principal: MoneyLike; until: LocalDate } | null = terms.carryOver ?? null;
  for (let i = 0; opening.gt(0); i++) {
    if (i >= maxLines) {
      if (terms.count !== undefined) break;
      throw new RangeError(`Погашение заняло бы больше ${MAX_LINES} месяцев`);
    }
    const nominal = nthDueDate(terms.firstDueDate, i, terms.paymentDay);
    const dueDate = adjustDueDate(nominal, terms.shiftWeekends);
    const interest = roundMoney(lineInterest(terms, opening, previousDate, nominal, carried), scale);
    const isLastByCount = terms.count !== undefined && i === terms.count - 1;
    let principalPart = payment.minus(interest);
    if (principalPart.lte(0) && !isLastByCount) {
      throw new RangeError("Платёж не покрывает проценты за период");
    }
    if (isLastByCount || principalPart.greaterThanOrEqualTo(opening)) principalPart = opening;
    const line = makeLine({
      installmentNumber: (terms.firstInstallmentNumber ?? 1) + i,
      dueDate,
      accrualDate: nominal,
      openingPrincipal: opening,
      principal: principalPart,
      interest,
      fees: lineFee(terms, i),
    });
    lines.push(line);
    opening = line.closingPrincipal;
    previousDate = nominal;
    carried = dueDate !== nominal ? { principal: line.principal, until: dueDate } : null;
  }
  return lines;
}
