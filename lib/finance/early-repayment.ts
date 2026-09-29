/**
 * Early repayment planning (SPEC §24). Produces the regenerated future lines
 * plus the before/after comparison. Default strategy: reduce term.
 * Interest savings are estimates until confirmed by a bank schedule.
 */
import type { LocalDate } from "./dates";
import { generateAnnuitySchedule } from "./annuity";
import { generateDifferentialSchedule } from "./differential";
import { money, roundMoney, ZERO, type FinDecimal, type MoneyLike } from "./money";
import { rechain, scheduleTotals, type DayCountConvention, type RepaymentType, type ScheduleLine } from "./schedule";

export type EarlyRepaymentStrategy = "REDUCE_TERM" | "REDUCE_PAYMENT";

export type EarlyRepaymentInput = {
  repaymentType: RepaymentType;
  strategy: EarlyRepaymentStrategy;
  /** The open future lines this plan replaces, in order. */
  futureLines: readonly ScheduleLine[];
  /** Principal those lines must amortise after the extra payment. */
  principalAfter: MoneyLike;
  annualRatePercent?: MoneyLike;
  /** Where interest starts accruing for the first new line. */
  periodStart?: LocalDate;
  firstDueDate?: LocalDate;
  paymentDay?: number;
  dayCount?: DayCountConvention;
  roundingScale?: number;
};

export type EarlyRepaymentPlan = {
  lines: ScheduleLine[];
  oldPayoffDate: LocalDate | null;
  newPayoffDate: LocalDate | null;
  monthsReduced: number;
  oldInterest: FinDecimal;
  newInterest: FinDecimal;
  /** Estimate only. */
  interestSaved: FinDecimal;
};

/** Keep each line's principal from the start, trimming the tail. */
function trimLines(lines: readonly ScheduleLine[], principal: FinDecimal): ScheduleLine[] {
  const kept: Omit<ScheduleLine, "openingPrincipal" | "closingPrincipal" | "total">[] = [];
  let remaining = principal;
  for (const line of lines) {
    if (remaining.lte(0)) break;
    const part = line.principal.lessThan(remaining) ? line.principal : remaining;
    kept.push({ ...line, principal: part });
    remaining = remaining.minus(part);
  }
  if (remaining.gt(0) && kept.length > 0) {
    const last = kept[kept.length - 1]!;
    kept[kept.length - 1] = { ...last, principal: last.principal.plus(remaining) };
  }
  return rechain(kept, principal);
}

/** Keep every date, scale each line's principal down proportionally. */
function scaleLines(lines: readonly ScheduleLine[], principal: FinDecimal, scale: number): ScheduleLine[] {
  const oldTotal = scheduleTotals(lines).principal;
  if (oldTotal.isZero()) return [];
  let allocated = ZERO;
  const scaled = lines.map((line, i) => {
    const part = i === lines.length - 1 ? principal.minus(allocated) : roundMoney(principal.times(line.principal).div(oldTotal), scale);
    allocated = allocated.plus(part);
    return { ...line, principal: part };
  });
  return rechain(scaled, principal);
}

export function planEarlyRepayment(input: EarlyRepaymentInput): EarlyRepaymentPlan {
  const principal = money(input.principalAfter);
  const scale = input.roundingScale ?? 2;
  const first = input.futureLines[0];
  let lines: ScheduleLine[] = [];

  if (principal.gt(0) && first) {
    const common = {
      principal,
      annualRatePercent: input.annualRatePercent ?? 0,
      periodStart: input.periodStart ?? first.dueDate,
      firstDueDate: input.firstDueDate ?? first.dueDate,
      paymentDay: input.paymentDay,
      dayCount: input.dayCount,
      roundingScale: scale,
      firstInstallmentNumber: first.installmentNumber,
    };
    const keepCount = input.futureLines.length;
    if (input.repaymentType === "DIFFERENTIAL") {
      lines =
        input.strategy === "REDUCE_TERM"
          ? generateDifferentialSchedule({ ...common, principalPerPeriod: first.principal })
          : generateDifferentialSchedule({ ...common, count: keepCount });
    } else if (input.repaymentType === "ANNUITY") {
      lines =
        input.strategy === "REDUCE_TERM"
          ? generateAnnuitySchedule({ ...common, fixedPayment: first.total.minus(first.fees) })
          : generateAnnuitySchedule({ ...common, count: keepCount });
    } else {
      // Interest-free, manual and custom schedules: work on the lines themselves.
      lines = input.strategy === "REDUCE_TERM" ? trimLines(input.futureLines, principal) : scaleLines(input.futureLines, principal, scale);
    }
  }

  const oldInterest = scheduleTotals(input.futureLines).interest;
  const newInterest = scheduleTotals(lines).interest;
  return {
    lines,
    oldPayoffDate: input.futureLines.at(-1)?.dueDate ?? null,
    newPayoffDate: lines.at(-1)?.dueDate ?? null,
    monthsReduced: Math.max(0, input.futureLines.length - lines.length),
    oldInterest,
    newInterest,
    interestSaved: oldInterest.minus(newInterest),
  };
}
