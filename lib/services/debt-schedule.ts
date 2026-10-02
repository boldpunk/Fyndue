import "server-only";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { addMonthsClamped, dbToLocalDate, localDateToDb } from "@/lib/finance/dates";
import { planEarlyRepayment, type EarlyRepaymentPlan, type EarlyRepaymentStrategy } from "@/lib/finance/early-repayment";
import { manualSchedule } from "@/lib/finance/installment";
import { money, ZERO, type FinDecimal } from "@/lib/finance/money";
import { makeLine, validateSchedule, type ScheduleLine } from "@/lib/finance/schedule";
import type { Debt, DebtScheduleItem, ScheduleVersionReason } from "@/lib/generated/prisma/client";
import type { ReplaceScheduleInput } from "@/lib/validations/debts";
import { writeAudit } from "./audit";

/** DB line → engine line. */
export function itemToLine(item: DebtScheduleItem): ScheduleLine {
  return makeLine({
    installmentNumber: item.installmentNumber,
    dueDate: dbToLocalDate(item.dueDate),
    openingPrincipal: item.openingPrincipal,
    principal: item.plannedPrincipal,
    interest: item.plannedInterest,
    fees: item.plannedFees,
  });
}

/** Engine line → create payload. */
export function lineToItemData(line: ScheduleLine, base: { userId: string; debtId: string; scheduleVersionId: string; isEstimate: boolean }) {
  return {
    ...base,
    installmentNumber: line.installmentNumber,
    dueDate: localDateToDb(line.dueDate),
    openingPrincipal: line.openingPrincipal.toFixed(2),
    plannedPrincipal: line.principal.toFixed(2),
    plannedInterest: line.interest.toFixed(2),
    plannedFees: line.fees.toFixed(2),
    plannedTotal: line.total.toFixed(2),
    closingPrincipal: line.closingPrincipal.toFixed(2),
  };
}

/**
 * Lines that regeneration must never touch: anything settled, skipped or
 * with money already applied (docs/debt-engine.md §2).
 */
export function isFrozen(item: DebtScheduleItem): boolean {
  return item.status === "PAID" || item.status === "PARTIALLY_PAID" || item.status === "SKIPPED" || money(item.paidTotal).gt(0);
}

export type ScheduleSplit = {
  current: DebtScheduleItem[];
  frozen: DebtScheduleItem[];
  open: DebtScheduleItem[];
  /** Principal still owed on frozen, partially paid lines. */
  reserved: FinDecimal;
  /** Principal the open (regenerable) part of the schedule must amortise. */
  principalToPlan: FinDecimal;
};

export async function splitCurrentSchedule(tx: Tx, debt: Debt): Promise<ScheduleSplit> {
  const current = await tx.debtScheduleItem.findMany({
    where: { debtId: debt.id, userId: debt.userId, isCurrent: true },
    orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
  });
  const frozen = current.filter(isFrozen);
  const open = current.filter((i) => !isFrozen(i));
  const reserved = frozen
    .filter((i) => i.status === "PARTIALLY_PAID")
    .reduce((sum, i) => {
      const left = money(i.plannedPrincipal).minus(money(i.paidPrincipal));
      return left.gt(0) ? sum.plus(left) : sum;
    }, ZERO);
  const principalToPlan = money(debt.currentPrincipal).minus(reserved);
  return { current, frozen, open, reserved, principalToPlan: principalToPlan.gt(0) ? principalToPlan : ZERO };
}

/** Where interest for the first open line starts accruing. */
function periodStartFor(debt: Debt, split: ScheduleSplit) {
  const firstOpen = split.open[0];
  const before = firstOpen ? split.current.filter((i) => i.dueDate < firstOpen.dueDate).at(-1) : split.current.at(-1);
  if (before) return dbToLocalDate(before.dueDate);
  if (money(debt.paidBeforeTracking).gt(0) && debt.firstPaymentDate) return addMonthsClamped(dbToLocalDate(debt.firstPaymentDate), -1);
  return dbToLocalDate(debt.startDate);
}

/** Pure(ish) preview of an early repayment on the current schedule. */
export function planForSplit(debt: Debt, split: ScheduleSplit, principalAfter: FinDecimal, strategy: EarlyRepaymentStrategy): EarlyRepaymentPlan {
  return planEarlyRepayment({
    repaymentType: debt.repaymentType,
    strategy,
    futureLines: split.open.map(itemToLine),
    principalAfter,
    annualRatePercent: debt.annualInterestRate ?? 0,
    periodStart: periodStartFor(debt, split),
    paymentDay: debt.paymentDay ?? undefined,
    dayCount: debt.dayCountConvention,
    roundingScale: debt.roundingScale,
  });
}

/** Installment numbers for new lines, skipping numbers held by frozen lines. */
function renumber(lines: ScheduleLine[], firstNumber: number, taken: Set<number>): ScheduleLine[] {
  let n = firstNumber;
  return lines.map((line) => {
    while (taken.has(n)) n++;
    return { ...line, installmentNumber: n++ };
  });
}

/**
 * Replaces the open part of the current schedule with `lines` as a new,
 * immutable version. Old lines are kept (isCurrent = false), so every past
 * version stays reconstructable. Must run inside the debt's row lock.
 */
export async function writeNewScheduleVersion(
  tx: Tx,
  debt: Debt,
  split: ScheduleSplit,
  lines: ScheduleLine[],
  options: { reason: ScheduleVersionReason; note?: string; isEstimate: boolean },
): Promise<string> {
  const last = await tx.debtScheduleVersion.aggregate({ where: { debtId: debt.id }, _max: { version: true } });
  const firstNumber = split.open[0]?.installmentNumber ?? Math.max(0, ...split.current.map((i) => i.installmentNumber)) + 1;
  const numbered = renumber(lines, firstNumber, new Set(split.frozen.map((i) => i.installmentNumber)));

  const version = await tx.debtScheduleVersion.create({
    data: {
      userId: debt.userId,
      debtId: debt.id,
      version: (last._max.version ?? 0) + 1,
      reason: options.reason,
      note: options.note ?? null,
      effectiveFrom: numbered[0] ? localDateToDb(numbered[0].dueDate) : null,
    },
  });
  if (split.open.length) {
    await tx.debtScheduleItem.updateMany({
      where: { id: { in: split.open.map((i) => i.id) }, userId: debt.userId },
      data: { isCurrent: false, supersededByVersionId: version.id },
    });
  }
  if (numbered.length) {
    await tx.debtScheduleItem.createMany({
      data: numbered.map((line) =>
        lineToItemData(line, { userId: debt.userId, debtId: debt.id, scheduleVersionId: version.id, isEstimate: options.isEstimate }),
      ),
    });
  }
  await tx.debt.update({ where: { id: debt.id }, data: { activeScheduleVersionId: version.id } });
  await refreshDebtState(tx, debt.id);
  await writeAudit(tx, {
    userId: debt.userId,
    action: "SCHEDULE_REGENERATED",
    entityType: "Debt",
    entityId: debt.id,
    metadata: { version: version.version, reason: options.reason, lines: numbered.length },
  });
  return version.id;
}

/**
 * Recomputes derived debt fields: projected end date and PAID_OFF / ACTIVE
 * status. Archived debts keep their status.
 */
export async function refreshDebtState(tx: Tx, debtId: string): Promise<void> {
  const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId } });
  const openItems = await tx.debtScheduleItem.findMany({
    where: { debtId, isCurrent: true, status: { in: ["SCHEDULED", "PARTIALLY_PAID"] } },
    orderBy: { dueDate: "desc" },
    take: 1,
  });
  const paidOff = money(debt.currentPrincipal).isZero() && openItems.length === 0;
  await tx.debt.update({
    where: { id: debtId },
    data: {
      currentProjectedEndDate: openItems[0]?.dueDate ?? null,
      ...(debt.status === "ARCHIVED" ? {} : { status: paidOff ? "PAID_OFF" : "ACTIVE" }),
    },
  });
}

/** Manual edit or bank schedule override of the open part (SPEC §17). */
export async function replaceOpenSchedule(tx: Tx, debt: Debt, input: Pick<ReplaceScheduleInput, "reason" | "note" | "lines">) {
  const split = await splitCurrentSchedule(tx, debt);
  let lines: ScheduleLine[];
  try {
    lines = manualSchedule(input.lines, split.principalToPlan);
  } catch (error) {
    throw new DomainError(error instanceof Error ? error.message : "Неверный график", "INVALID_SCHEDULE");
  }
  const lastFrozen = split.frozen.at(-1);
  if (lastFrozen && lines[0] && lines[0].dueDate <= dbToLocalDate(lastFrozen.dueDate)) {
    throw new DomainError("Новые платежи должны идти после последнего оплаченного.", "INVALID_SCHEDULE");
  }
  const problems = validateSchedule(lines, split.principalToPlan);
  if (problems.length) throw new DomainError(problems[0]!, "INVALID_SCHEDULE");
  return writeNewScheduleVersion(tx, debt, split, lines, { reason: input.reason, note: input.note, isEstimate: false });
}
