/**
 * Builds a new debt's initial schedule from wizard terms. Shared by the
 * wizard's live preview (client) and createDebt (server), so both always
 * agree. Pure.
 */
import { generateAnnuitySchedule } from "./annuity";
import { addMonthsClamped, daysBetween, type LocalDate } from "./dates";
import { generateDifferentialSchedule } from "./differential";
import { generateInstallmentSchedule, knownTotalSchedule, manualSchedule } from "./installment";
import { resolveFeeStructure, type FeeMode, type FeeStructure } from "./microloan";
import { money, type FinDecimal, type MoneyLike } from "./money";
import { validateSchedule, type DayCountConvention, type RepaymentType, type ScheduleLine } from "./schedule";

export type DebtPlanInput = {
  repaymentType: RepaymentType;
  originalPrincipal: MoneyLike;
  paidBeforeTracking?: MoneyLike;
  feeMode?: FeeMode;
  originationFee?: MoneyLike;
  netAmountReceived?: MoneyLike;
  annualInterestRate?: MoneyLike;
  dayCountConvention?: DayCountConvention;
  roundingScale?: number;
  startDate: LocalDate;
  firstPaymentDate: LocalDate;
  paymentDay?: number;
  termMonths?: number;
  installmentAmount?: MoneyLike;
  knownTotalRepayment?: boolean;
  manualLines?: { dueDate: LocalDate; principal: MoneyLike; interest?: MoneyLike; fees?: MoneyLike }[];
  knownTotalLines?: { dueDate: LocalDate; total: MoneyLike }[];
};

export type DebtPlan = {
  fee: FeeStructure;
  /** principalBasis − paidBeforeTracking: what the schedule amortises. */
  remainingPrincipal: FinDecimal;
  lines: ScheduleLine[];
  /** True when figures are computed estimates (interest formulas). */
  isEstimate: boolean;
};

export type DebtPlanResult = { ok: true; plan: DebtPlan } | { ok: false; error: string; field?: string };

export function buildDebtPlan(input: DebtPlanInput): DebtPlanResult {
  try {
    const fee = resolveFeeStructure({
      contractPrincipal: input.originalPrincipal,
      feeMode: input.feeMode ?? "NONE",
      fee: input.originationFee,
      netReceived: input.netAmountReceived,
    });
    const paidBefore = money(input.paidBeforeTracking ?? 0);
    const remaining = fee.principalBasis.minus(paidBefore);
    if (remaining.lte(0)) return { ok: false, error: "Already paid must be less than the debt amount", field: "paidBeforeTracking" };
    if (daysBetween(input.startDate, input.firstPaymentDate) < 0) {
      return { ok: false, error: "The first payment can't be before the start date", field: "firstPaymentDate" };
    }
    const scale = input.roundingScale ?? 2;
    // When earlier payments were made outside Fyndue, interest for the first
    // tracked line accrues from the month before it.
    const periodStart = paidBefore.gt(0) ? addMonthsClamped(input.firstPaymentDate, -1) : input.startDate;
    const lineFees = fee.scheduledFee.gt(0) ? [fee.scheduledFee] : undefined;
    const common = { principal: remaining, firstDueDate: input.firstPaymentDate, paymentDay: input.paymentDay, roundingScale: scale, lineFees };

    let lines: ScheduleLine[];
    let isEstimate = false;
    if (input.knownTotalRepayment) {
      if (!input.knownTotalLines?.length) return { ok: false, error: "Add the amounts due", field: "knownTotalLines" };
      lines = knownTotalSchedule(remaining, input.knownTotalLines, scale);
    } else {
      switch (input.repaymentType) {
        case "DIFFERENTIAL":
        case "ANNUITY": {
          if (input.annualInterestRate === undefined) return { ok: false, error: "Enter the annual interest rate", field: "annualInterestRate" };
          if (!input.termMonths) return { ok: false, error: "Enter the number of payments", field: "termMonths" };
          const terms = {
            ...common,
            annualRatePercent: input.annualInterestRate,
            periodStart,
            dayCount: input.dayCountConvention,
            count: input.termMonths,
          };
          lines = input.repaymentType === "DIFFERENTIAL" ? generateDifferentialSchedule(terms) : generateAnnuitySchedule(terms);
          isEstimate = true;
          break;
        }
        case "INTEREST_FREE":
          if (input.installmentAmount !== undefined) {
            lines = generateInstallmentSchedule({ ...common, fixedAmount: input.installmentAmount });
          } else if (input.termMonths) {
            lines = generateInstallmentSchedule({ ...common, count: input.termMonths });
          } else {
            return { ok: false, error: "Enter the number of installments or the monthly amount", field: "termMonths" };
          }
          break;
        case "MANUAL":
        case "CUSTOM":
          if (!input.manualLines?.length) return { ok: false, error: "Add at least one payment", field: "manualLines" };
          lines = manualSchedule(input.manualLines, remaining);
          break;
      }
    }
    const problems = validateSchedule(lines, remaining);
    if (problems.length) return { ok: false, error: problems[0]! };
    return { ok: true, plan: { fee, remainingPrincipal: remaining, lines, isEstimate } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not build the schedule" };
  }
}
