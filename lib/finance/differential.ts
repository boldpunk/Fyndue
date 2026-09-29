/**
 * Differential repayment (SPEC §17): equal principal parts, interest on the
 * remaining balance. Actual bank schedules always override these estimates.
 */
import { money, roundMoney, type MoneyLike } from "./money";
import { lineFee, makeLine, MAX_LINES, nthDueDate, periodRate, type GeneratedTerms, type ScheduleLine } from "./schedule";

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
  if (part.lte(0)) throw new RangeError("Principal per period must be positive");
  const count = terms.count ?? Math.ceil(principal.div(part).toNumber());
  if (count < 1 || count > MAX_LINES) throw new RangeError(`A schedule needs between 1 and ${MAX_LINES} payments`);

  const lines: ScheduleLine[] = [];
  let opening = principal;
  let previousDate = terms.periodStart;
  for (let i = 0; i < count && opening.gt(0); i++) {
    const dueDate = nthDueDate(terms.firstDueDate, i, terms.paymentDay);
    const isLast = i === count - 1 || opening.lessThanOrEqualTo(part);
    const principalPart = isLast ? opening : part;
    const interest = roundMoney(opening.times(periodRate(terms.annualRatePercent, previousDate, dueDate, terms.dayCount)), scale);
    const line = makeLine({
      installmentNumber: (terms.firstInstallmentNumber ?? 1) + i,
      dueDate,
      openingPrincipal: opening,
      principal: principalPart,
      interest,
      fees: lineFee(terms, i),
    });
    lines.push(line);
    opening = line.closingPrincipal;
    previousDate = dueDate;
  }
  return lines;
}
