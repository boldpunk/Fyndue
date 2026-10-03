/**
 * Interest-free installments (SPEC §19), manual schedules and the microloan
 * "known total repayment" mode (SPEC §19A). No interest formula is invented.
 */
import { adjustDueDate } from "./business-days";
import { daysBetween, type LocalDate } from "./dates";
import { money, roundMoney, sumMoney, ZERO, type MoneyLike } from "./money";
import { makeLine, MAX_LINES, nthDueDate, rechain, type ScheduleLine } from "./schedule";

export type InstallmentTerms = {
  principal: MoneyLike;
  firstDueDate: LocalDate;
  paymentDay?: number;
  roundingScale?: number;
  firstInstallmentNumber?: number;
  lineFees?: MoneyLike[];
  /** Move due dates off weekends and public holidays. */
  shiftWeekends?: boolean;
} & ({ count: number; fixedAmount?: undefined } | { fixedAmount: MoneyLike; count?: undefined });

export function generateInstallmentSchedule(terms: InstallmentTerms): ScheduleLine[] {
  const scale = terms.roundingScale ?? 2;
  const principal = money(terms.principal);
  if (principal.isZero()) return [];
  const part = terms.fixedAmount !== undefined ? roundMoney(terms.fixedAmount, scale) : roundMoney(principal.div(terms.count), scale);
  if (part.lte(0)) throw new RangeError("Сумма платежа должна быть больше нуля");
  const count = terms.count ?? Math.ceil(principal.div(part).toNumber());
  if (count < 1 || count > MAX_LINES) throw new RangeError(`В графике должно быть от 1 до ${MAX_LINES} платежей`);

  const lines: ScheduleLine[] = [];
  let opening = principal;
  for (let i = 0; i < count && opening.gt(0); i++) {
    const isLast = i === count - 1 || opening.lessThanOrEqualTo(part);
    const fee = terms.lineFees?.[i];
    const line = makeLine({
      installmentNumber: (terms.firstInstallmentNumber ?? 1) + i,
      dueDate: adjustDueDate(nthDueDate(terms.firstDueDate, i, terms.paymentDay), terms.shiftWeekends),
      accrualDate: nthDueDate(terms.firstDueDate, i, terms.paymentDay),
      openingPrincipal: opening,
      principal: isLast ? opening : part,
      fees: fee === undefined ? ZERO : roundMoney(fee, scale),
    });
    lines.push(line);
    opening = line.closingPrincipal;
  }
  return lines;
}

export type ManualLineInput = {
  dueDate: LocalDate;
  principal: MoneyLike;
  interest?: MoneyLike;
  fees?: MoneyLike;
};

function assertOrdered(dates: LocalDate[]) {
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i - 1]!, dates[i]!) <= 0) throw new RangeError("Даты платежей должны идти по порядку, по одной строке на дату");
  }
}

/**
 * A schedule typed in by the user or copied from the bank. Amounts are
 * taken as given; only structure is checked.
 */
export function manualSchedule(inputs: ManualLineInput[], expectedPrincipal: MoneyLike, firstInstallmentNumber = 1): ScheduleLine[] {
  if (inputs.length === 0) throw new RangeError("Добавьте хотя бы один платёж");
  if (inputs.length > MAX_LINES) throw new RangeError(`Не больше ${MAX_LINES} платежей`);
  assertOrdered(inputs.map((l) => l.dueDate));
  const total = sumMoney(inputs.map((l) => l.principal));
  if (!total.equals(money(expectedPrincipal))) {
    throw new RangeError(`Основной долг в строках (${total.toFixed(2)}) должен давать в сумме ${money(expectedPrincipal).toFixed(2)}`);
  }
  return rechain(
    inputs.map((l, i) => ({
      installmentNumber: firstInstallmentNumber + i,
      dueDate: l.dueDate,
      principal: money(l.principal),
      interest: money(l.interest ?? 0),
      fees: money(l.fees ?? 0),
    })),
    expectedPrincipal,
    firstInstallmentNumber,
  );
}

/**
 * The lender gave only amounts due (e.g. an MFO: "2,100,000 on 1 Nov").
 * Principal is allocated pro rata to each amount; the rest is recorded as
 * unitemised cost in `fees`, never as a made-up interest split.
 */
export function knownTotalSchedule(
  principal: MoneyLike,
  inputs: { dueDate: LocalDate; total: MoneyLike }[],
  roundingScale = 2,
  firstInstallmentNumber = 1,
): ScheduleLine[] {
  if (inputs.length === 0) throw new RangeError("Добавьте хотя бы один платёж");
  assertOrdered(inputs.map((l) => l.dueDate));
  const p = money(principal);
  const grandTotal = sumMoney(inputs.map((l) => l.total));
  if (grandTotal.lessThan(p)) throw new RangeError("Общая сумма выплат меньше суммы долга");

  let allocated = ZERO;
  let opening = p;
  return inputs.map((input, i) => {
    const total = money(input.total);
    const isLast = i === inputs.length - 1;
    const principalPart = isLast ? p.minus(allocated) : roundMoney(p.times(total).div(grandTotal), roundingScale);
    allocated = allocated.plus(principalPart);
    const line = makeLine({
      installmentNumber: firstInstallmentNumber + i,
      dueDate: input.dueDate,
      openingPrincipal: opening,
      principal: principalPart,
      fees: total.minus(principalPart),
    });
    opening = line.closingPrincipal;
    return line;
  });
}
