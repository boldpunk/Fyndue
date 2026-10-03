/**
 * Differential repayment (SPEC §17): equal principal parts, interest on the
 * remaining balance. Actual bank schedules always override these estimates.
 */
import { adjustDueDate } from "./business-days";
import type { LocalDate } from "./dates";
import { money, roundMoney, type MoneyLike } from "./money";
import { lineFee, makeLine, MAX_LINES, lineInterest, nthDueDate, type GeneratedTerms, type ScheduleLine } from "./schedule";

export type DifferentialTerms = GeneratedTerms &
  (
    | { count: number; principalPerPeriod?: undefined }
    /** Keep this principal part and let the number of lines follow (reduce term). */
    | { principalPerPeriod: MoneyLike; count?: undefined }
  );

export function generateDifferentialSchedule(terms: DifferentialTerms): ScheduleLine[] {
  const scale = terms.roundingScale ?? 2;
  const principal = money(terms.principal);
  if (principal.isZero()) return [];
  const part = terms.principalPerPeriod !== undefined
    ? roundMoney(terms.principalPerPeriod, scale)
    : roundMoney(principal.div(terms.count), scale);
  if (part.lte(0)) throw new RangeError("Основной долг за период должен быть больше нуля");
  const count = terms.count ?? Math.ceil(principal.div(part).toNumber());
  if (count < 1 || count > MAX_LINES) throw new RangeError(`В графике должно быть от 1 до ${MAX_LINES} платежей`);

  const lines: ScheduleLine[] = [];
  let opening = principal;
  let previousDate = terms.periodStart;
  let carried: { principal: MoneyLike; until: LocalDate } | null = terms.carryOver ?? null;
  for (let i = 0; i < count && opening.gt(0); i++) {
    const nominal = nthDueDate(terms.firstDueDate, i, terms.paymentDay);
    const dueDate = adjustDueDate(nominal, terms.shiftWeekends);
    const isLast = i === count - 1 || opening.lessThanOrEqualTo(part);
    const principalPart = isLast ? opening : part;
    const interest = roundMoney(lineInterest(terms, opening, previousDate, nominal, carried), scale);
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
