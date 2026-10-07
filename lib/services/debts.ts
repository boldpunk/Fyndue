import "server-only";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { debtCost } from "@/lib/finance/debt-cost";
import { buildDebtPlan } from "@/lib/finance/debt-plan";
import { debtProgress } from "@/lib/finance/debt-progress";
import { dbToLocalDate, localDateToDb, todayIn, type LocalDate } from "@/lib/finance/dates";
import { money, toMoneyString } from "@/lib/finance/money";
import { displayPaymentStatus, type DisplayPaymentStatus } from "@/lib/finance/payment-status";
import type { Debt, DebtPayment, DebtScheduleItem } from "@/lib/generated/prisma/client";
import type { DebtCreateInput } from "@/lib/validations/debts";
import { applyBalanceDelta, assertTrackedDate, lockOwnedAccount } from "./accounts";
import { assertWithinLimit } from "./billing";
import { writeAudit } from "./audit";
import { lockOwnedDebt } from "./debt-payments";
import { lineToItemData, setWeekendShift } from "./debt-schedule";
import { isUniqueViolation } from "./prisma-errors";

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export type ScheduleItemDTO = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  /** Contract date when the payment was moved off a weekend/holiday. */
  accrualDate: string | null;
  openingPrincipal: string;
  plannedPrincipal: string;
  plannedInterest: string;
  plannedFees: string;
  plannedTotal: string;
  closingPrincipal: string;
  paidPrincipal: string;
  paidInterest: string;
  paidFees: string;
  paidTotal: string;
  remainingTotal: string;
  status: DebtScheduleItem["status"];
  displayStatus: DisplayPaymentStatus;
  days: number;
  isEstimate: boolean;
  isOpen: boolean;
  versionNumber?: number;
};

export type DebtPaymentDTO = {
  id: string;
  paymentDate: string;
  scheduleItemId: string | null;
  installmentNumber: number | null;
  account: { id: string; name: string };
  amountAppliedToDebt: string;
  actualAccountDebit: string;
  principal: string;
  interest: string;
  originationFee: string;
  processingFee: string;
  penalty: string;
  otherFee: string;
  isEarlyRepayment: boolean;
  note: string | null;
  isReversed: boolean;
  reversalReason: string | null;
  transactionId: string | null;
};

export type DebtSummaryDTO = {
  id: string;
  name: string;
  lender: string | null;
  type: Debt["type"];
  repaymentType: Debt["repaymentType"];
  currency: Debt["currency"];
  status: Debt["status"];
  originalPrincipal: string;
  principalBasis: string;
  currentPrincipal: string;
  paidPrincipal: string;
  paidPercent: string;
  remainingPercent: string;
  paymentsCompleted: number;
  paymentsRemaining: number;
  remainingInterestEstimate: string;
  plannedFutureTotal: string;
  projectedPayoffDate: string | null;
  nextPayment: { itemId: string; dueDate: string; amountDue: string; daysUntil: number; displayStatus: DisplayPaymentStatus } | null;
  hasEstimates: boolean;
  knownTotalRepayment: boolean;
};

export type DebtDetailDTO = DebtSummaryDTO & {
  paidBeforeTracking: string;
  netAmountReceived: string | null;
  annualInterestRate: string | null;
  dayCountConvention: Debt["dayCountConvention"];
  feeMode: Debt["feeMode"];
  originationFeeAmount: string | null;
  contractTotalRepayment: string | null;
  startDate: string;
  firstPaymentDate: string | null;
  paymentDay: number | null;
  shiftWeekends: boolean;
  notes: string | null;
  disbursementAccountId: string | null;
  schedule: ScheduleItemDTO[];
  /** Principal the open lines must amortise (excludes what partially paid lines still owe). */
  principalToPlan: string;
  payments: DebtPaymentDTO[];
  versions: { id: string; version: number; reason: string; note: string | null; createdAt: string; isActive: boolean }[];
  cost: {
    principalPaid: string;
    interestPaid: string;
    originationFeesPaid: string;
    processingFeesPaid: string;
    otherFeesPaid: string;
    penaltiesPaid: string;
    feesPaid: string;
    costAbovePrincipal: string;
    cashOutflow: string;
  };
};

type Thresholds = { dueSoonDays: number; urgentDays: number };

async function contextFor(userId: string): Promise<{ today: LocalDate } & Thresholds> {
  const [user, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }),
    prisma.userSettings.findUnique({ where: { userId }, select: { dueSoonDays: true, urgentDays: true } }),
  ]);
  return { today: todayIn(user.timezone), dueSoonDays: settings?.dueSoonDays ?? 7, urgentDays: settings?.urgentDays ?? 2 };
}

export function toItemDTO(item: DebtScheduleItem, ctx: { today: LocalDate } & Thresholds): ScheduleItemDTO {
  const dueDate = dbToLocalDate(item.dueDate);
  const status = displayPaymentStatus({ status: item.status, dueDate, today: ctx.today, dueSoonDays: ctx.dueSoonDays, urgentDays: ctx.urgentDays });
  const remaining = money(item.plannedTotal).minus(money(item.paidTotal));
  return {
    id: item.id,
    installmentNumber: item.installmentNumber,
    dueDate,
    accrualDate: item.accrualDate ? dbToLocalDate(item.accrualDate) : null,
    openingPrincipal: toMoneyString(item.openingPrincipal),
    plannedPrincipal: toMoneyString(item.plannedPrincipal),
    plannedInterest: toMoneyString(item.plannedInterest),
    plannedFees: toMoneyString(item.plannedFees),
    plannedTotal: toMoneyString(item.plannedTotal),
    closingPrincipal: toMoneyString(item.closingPrincipal),
    paidPrincipal: toMoneyString(item.paidPrincipal),
    paidInterest: toMoneyString(item.paidInterest),
    paidFees: toMoneyString(item.paidFees),
    paidTotal: toMoneyString(item.paidTotal),
    remainingTotal: toMoneyString(remaining.gt(0) ? remaining : 0),
    status: item.status,
    displayStatus: status.status,
    days: status.days,
    isEstimate: item.isEstimate,
    isOpen: item.status === "SCHEDULED" || item.status === "PARTIALLY_PAID",
  };
}

function summarize(debt: Debt, items: DebtScheduleItem[], ctx: { today: LocalDate } & Thresholds): DebtSummaryDTO {
  const progress = debtProgress({
    principalBasis: debt.principalBasis,
    currentPrincipal: debt.currentPrincipal,
    items: items.map((i) => ({ ...i, dueDate: dbToLocalDate(i.dueDate) })),
    today: ctx.today,
  });
  const nextItem = progress.nextPayment ? items[progress.nextPayment.index] : undefined;
  return {
    id: debt.id,
    name: debt.name,
    lender: debt.lender,
    type: debt.type,
    repaymentType: debt.repaymentType,
    currency: debt.currency,
    status: debt.status,
    originalPrincipal: toMoneyString(debt.originalPrincipal),
    principalBasis: toMoneyString(debt.principalBasis),
    currentPrincipal: toMoneyString(debt.currentPrincipal),
    paidPrincipal: toMoneyString(progress.paidPrincipal),
    paidPercent: progress.paidPercent.toDecimalPlaces(2).toFixed(2),
    remainingPercent: progress.remainingPercent.toDecimalPlaces(2).toFixed(2),
    paymentsCompleted: progress.paymentsCompleted,
    paymentsRemaining: progress.paymentsRemaining,
    remainingInterestEstimate: toMoneyString(progress.remainingInterestEstimate),
    plannedFutureTotal: toMoneyString(progress.plannedFutureTotal),
    projectedPayoffDate: progress.projectedPayoffDate,
    nextPayment:
      progress.nextPayment && nextItem
        ? {
            itemId: nextItem.id,
            dueDate: progress.nextPayment.dueDate,
            amountDue: toMoneyString(progress.nextPayment.amountDue),
            daysUntil: progress.nextPayment.daysUntil,
            displayStatus: toItemDTO(nextItem, ctx).displayStatus,
          }
        : null,
    hasEstimates: items.some((i) => i.isEstimate && money(i.plannedInterest).gt(0)),
    knownTotalRepayment: debt.knownTotalRepayment,
  };
}

function toPaymentDTO(
  p: DebtPayment & { account: { id: string; name: string }; scheduleItem: { installmentNumber: number } | null; transaction: { id: string } | null },
): DebtPaymentDTO {
  return {
    id: p.id,
    paymentDate: dbToLocalDate(p.paymentDate),
    scheduleItemId: p.scheduleItemId,
    installmentNumber: p.scheduleItem?.installmentNumber ?? null,
    account: p.account,
    amountAppliedToDebt: toMoneyString(p.amountAppliedToDebt),
    actualAccountDebit: toMoneyString(p.actualAccountDebit),
    principal: toMoneyString(p.principalAmount),
    interest: toMoneyString(p.interestAmount),
    originationFee: toMoneyString(p.originationFeeAmount),
    processingFee: toMoneyString(p.paymentProcessingFeeAmount),
    penalty: toMoneyString(p.penaltyAmount),
    otherFee: toMoneyString(p.otherFeeAmount),
    isEarlyRepayment: p.isEarlyRepayment,
    note: p.note,
    isReversed: p.reversedAt !== null,
    reversalReason: p.reversalReason,
    transactionId: p.transaction?.id ?? null,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export type DebtTab = "active" | "paid" | "archived";
const TAB_STATUS = { active: "ACTIVE", paid: "PAID_OFF", archived: "ARCHIVED" } as const;

export async function listDebts(userId: string, tab: DebtTab = "active"): Promise<DebtSummaryDTO[]> {
  const ctx = await contextFor(userId);
  const debts = await prisma.debt.findMany({
    where: { userId, status: TAB_STATUS[tab] },
    include: { scheduleItems: { where: { isCurrent: true }, orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }] } },
    orderBy: [{ createdAt: "asc" }],
  });
  return debts.map((d) => summarize(d, d.scheduleItems, ctx));
}

export async function countDebtsByStatus(userId: string) {
  const rows = await prisma.debt.groupBy({ by: ["status"], where: { userId }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.status, r._count])) as Partial<Record<Debt["status"], number>>;
}

export async function getDebtDetail(userId: string, id: string): Promise<DebtDetailDTO> {
  const ctx = await contextFor(userId);
  const debt = await prisma.debt.findFirst({
    where: { id, userId },
    include: {
      scheduleItems: { where: { isCurrent: true }, orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }] },
      payments: {
        include: { account: { select: { id: true, name: true } }, scheduleItem: { select: { installmentNumber: true } }, transaction: { select: { id: true } } },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      },
      scheduleVersions: { orderBy: { version: "desc" } },
    },
  });
  if (!debt) throw new NotFoundError("Debt");
  const live = debt.payments.filter((p) => p.reversedAt === null);
  const cost = debtCost(
    live.map((p) => ({
      principal: p.principalAmount,
      interest: p.interestAmount,
      originationFee: p.originationFeeAmount,
      processingFee: p.paymentProcessingFeeAmount,
      penalty: p.penaltyAmount,
      otherFee: p.otherFeeAmount,
      actualAccountDebit: p.actualAccountDebit,
    })),
  );
  return {
    ...summarize(debt, debt.scheduleItems, ctx),
    paidBeforeTracking: toMoneyString(debt.paidBeforeTracking),
    netAmountReceived: debt.netAmountReceived ? toMoneyString(debt.netAmountReceived) : null,
    annualInterestRate: debt.annualInterestRate ? debt.annualInterestRate.toString() : null,
    dayCountConvention: debt.dayCountConvention,
    feeMode: debt.feeMode,
    originationFeeAmount: debt.originationFeeAmount ? toMoneyString(debt.originationFeeAmount) : null,
    contractTotalRepayment: debt.contractTotalRepayment ? toMoneyString(debt.contractTotalRepayment) : null,
    startDate: dbToLocalDate(debt.startDate),
    firstPaymentDate: debt.firstPaymentDate ? dbToLocalDate(debt.firstPaymentDate) : null,
    paymentDay: debt.paymentDay,
    shiftWeekends: debt.shiftWeekends,
    notes: debt.notes,
    disbursementAccountId: debt.disbursementAccountId,
    schedule: debt.scheduleItems.map((i) => toItemDTO(i, ctx)),
    principalToPlan: toMoneyString(
      debt.scheduleItems
        .filter((i) => i.status === "PARTIALLY_PAID")
        .reduce((left, i) => left.minus(money(i.plannedPrincipal).minus(money(i.paidPrincipal))), money(debt.currentPrincipal)),
    ),
    payments: debt.payments.map(toPaymentDTO),
    versions: debt.scheduleVersions.map((v) => ({
      id: v.id,
      version: v.version,
      reason: v.reason,
      note: v.note,
      createdAt: v.createdAt.toISOString(),
      isActive: v.id === debt.activeScheduleVersionId,
    })),
    cost: Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, toMoneyString(v)])) as DebtDetailDTO["cost"],
  };
}

/**
 * The schedule exactly as it stood at `version` (docs/debt-engine.md §2):
 * lines created at or before it and not yet superseded at that point.
 */
export async function getScheduleSnapshot(userId: string, debtId: string, version: number): Promise<ScheduleItemDTO[]> {
  const ctx = await contextFor(userId);
  const items = await prisma.debtScheduleItem.findMany({
    where: {
      userId,
      debtId,
      version: { version: { lte: version } },
      OR: [{ supersededByVersionId: null }, { supersededBy: { version: { gt: version } } }],
    },
    include: { version: { select: { version: true } } },
    orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
  });
  return items.map((i) => ({ ...toItemDTO(i, ctx), versionNumber: i.version.version }));
}

export type UpcomingPaymentDTO = ScheduleItemDTO & {
  debt: { id: string; name: string; lender: string | null; currency: string; currentPrincipal: string; feeMode: Debt["feeMode"] };
};

/** Open current lines of active debts due up to `until` (overdue included). */
export async function listUpcomingPayments(userId: string, options: { untilDays?: number } = {}): Promise<UpcomingPaymentDTO[]> {
  const ctx = await contextFor(userId);
  const until = new Date(localDateToDb(ctx.today).getTime() + (options.untilDays ?? 60) * 86_400_000);
  const items = await prisma.debtScheduleItem.findMany({
    where: {
      userId,
      isCurrent: true,
      status: { in: ["SCHEDULED", "PARTIALLY_PAID"] },
      dueDate: { lte: until },
      debt: { status: "ACTIVE" },
    },
    include: { debt: { select: { id: true, name: true, lender: true, currency: true, currentPrincipal: true, feeMode: true } } },
    orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
  });
  return items.map((i) => ({
    ...toItemDTO(i, ctx),
    debt: { ...i.debt, currentPrincipal: toMoneyString(i.debt.currentPrincipal) },
  }));
}

export async function listRecentDebtPayments(userId: string, limit = 50) {
  const payments = await prisma.debtPayment.findMany({
    where: { userId },
    include: {
      account: { select: { id: true, name: true } },
      scheduleItem: { select: { installmentNumber: true } },
      transaction: { select: { id: true } },
      debt: { select: { id: true, name: true, currency: true } },
    },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return payments.map((p) => ({ ...toPaymentDTO(p), debt: p.debt }));
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * Creates the debt, schedule version 1 with its lines and (optionally) the
 * loan disbursement into an account — all in one DB transaction (SPEC §16).
 */
export async function createDebt(userId: string, input: DebtCreateInput): Promise<{ id: string }> {
  const existing = await prisma.debt.findFirst({ where: { userId, clientRequestId: input.clientRequestId }, select: { id: true } });
  if (existing) return existing;
  await assertWithinLimit(userId, "debts");

  const result = buildDebtPlan(input);
  if (!result.ok) {
    throw new DomainError(result.error, "INVALID_DEBT", result.field ? { [result.field]: result.error } : undefined);
  }
  const { plan } = result;

  try {
    return await prisma.$transaction(async (tx) => {
      let disbursementAccountId: string | null = null;
      if (input.disbursementAccountId) {
        const account = await lockOwnedAccount(tx, userId, input.disbursementAccountId);
        if (account.isArchived) throw new DomainError("Этот счёт в архиве.", "ACCOUNT_ARCHIVED", { disbursementAccountId: "Счёт в архиве" });
        if (account.currency !== input.currency) {
          throw new DomainError(`Счёт должен быть в ${input.currency}.`, "CURRENCY_MISMATCH", { disbursementAccountId: `Выберите счёт в ${input.currency}` });
        }
        disbursementAccountId = account.id;
      }

      const lastLine = plan.lines.at(-1);
      const debt = await tx.debt.create({
        data: {
          userId,
          name: input.name,
          lender: input.lender ?? null,
          type: input.type,
          repaymentType: input.repaymentType,
          currency: input.currency,
          originalPrincipal: plan.fee.contractPrincipal.toFixed(2),
          principalBasis: plan.fee.principalBasis.toFixed(2),
          currentPrincipal: plan.remainingPrincipal.toFixed(2),
          paidBeforeTracking: input.paidBeforeTracking ?? "0",
          netAmountReceived: plan.fee.netReceived.toFixed(2),
          annualInterestRate: input.annualInterestRate ?? null,
          dayCountConvention: input.dayCountConvention,
          roundingScale: input.roundingScale,
          feeMode: input.feeMode,
          originationFeeAmount: input.originationFee ?? null,
          contractTotalRepayment: input.knownTotalRepayment
            ? plan.lines.reduce((s, l) => s.plus(l.total), money(0)).toFixed(2)
            : plan.fee.totalRepayment.toFixed(2),
          knownTotalRepayment: input.knownTotalRepayment,
          startDate: localDateToDb(input.startDate),
          endDate: lastLine ? localDateToDb(lastLine.dueDate) : null,
          firstPaymentDate: localDateToDb(input.firstPaymentDate),
          paymentDay: input.paymentDay ?? null,
          shiftWeekends: input.shiftWeekends,
          originalTermMonths: plan.lines.length,
          currentProjectedEndDate: lastLine ? localDateToDb(lastLine.dueDate) : null,
          disbursementAccountId,
          notes: input.notes ?? null,
          clientRequestId: input.clientRequestId,
        },
      });

      const version = await tx.debtScheduleVersion.create({
        data: {
          userId,
          debtId: debt.id,
          version: 1,
          reason: "INITIAL",
          effectiveFrom: plan.lines[0] ? localDateToDb(plan.lines[0].dueDate) : null,
        },
      });
      await tx.debtScheduleItem.createMany({
        data: plan.lines.map((line) =>
          lineToItemData(line, { userId, debtId: debt.id, scheduleVersionId: version.id, isEstimate: plan.isEstimate }),
        ),
      });
      await tx.debt.update({ where: { id: debt.id }, data: { activeScheduleVersionId: version.id } });

      if (disbursementAccountId && plan.fee.netReceived.gt(0)) {
        // Money actually received — not income (SPEC §19A, docs/database.md §3).
        await tx.transaction.create({
          data: {
            userId,
            accountId: disbursementAccountId,
            debtId: debt.id,
            type: "LOAN_DISBURSEMENT",
            direction: "INFLOW",
            amount: plan.fee.netReceived.toFixed(2),
            currency: input.currency,
            transactionDate: localDateToDb(input.startDate),
            note: input.name,
            source: "SYSTEM",
          },
        });
        await applyBalanceDelta(tx, disbursementAccountId, plan.fee.netReceived);
      }

      await writeAudit(tx, {
        userId,
        action: "DEBT_CREATED",
        entityType: "Debt",
        entityId: debt.id,
        metadata: {
          type: input.type,
          repaymentType: input.repaymentType,
          currency: input.currency,
          principalBasis: plan.fee.principalBasis.toFixed(2),
          lines: plan.lines.length,
        },
      });
      return { id: debt.id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "clientRequestId")) {
      const winner = await prisma.debt.findFirst({ where: { userId, clientRequestId: input.clientRequestId }, select: { id: true } });
      if (winner) return winner;
    }
    throw error;
  }
}

export async function updateDebtDetails(userId: string, input: { id: string; name: string; lender?: string; notes?: string }) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.debt.updateMany({
      where: { id: input.id, userId },
      data: { name: input.name, lender: input.lender ?? null, notes: input.notes ?? null },
    });
    if (result.count !== 1) throw new NotFoundError("Debt");
    await writeAudit(tx, { userId, action: "DEBT_UPDATED", entityType: "Debt", entityId: input.id, metadata: { name: input.name } });
  });
}

/**
 * The loan money arrived on an account, recorded after the debt was created
 * (the wizard's «Деньги поступили на счёт» was left empty). Same row the
 * wizard writes: LOAN_DISBURSEMENT, not income. Once per debt.
 */
export async function recordDebtDisbursement(
  userId: string,
  input: { id: string; accountId: string; amount: string; date: LocalDate },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const debt = await lockOwnedDebt(tx, userId, input.id);
    const existing = await tx.transaction.findFirst({ where: { userId, debtId: debt.id, type: "LOAN_DISBURSEMENT", voidedAt: null }, select: { id: true } });
    if (existing || debt.disbursementAccountId) throw new DomainError("Поступление по этому займу уже записано.", "ALREADY_DISBURSED");
    const account = await lockOwnedAccount(tx, userId, input.accountId);
    if (account.isArchived) throw new DomainError("Этот счёт в архиве.", "ACCOUNT_ARCHIVED", { accountId: "Счёт в архиве" });
    if (account.currency !== debt.currency) {
      throw new DomainError(`Счёт должен быть в ${debt.currency}.`, "CURRENCY_MISMATCH", { accountId: `Выберите счёт в ${debt.currency}` });
    }
    assertTrackedDate(account, input.date);
    await tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        debtId: debt.id,
        type: "LOAN_DISBURSEMENT",
        direction: "INFLOW",
        amount: input.amount,
        currency: debt.currency,
        transactionDate: localDateToDb(input.date),
        note: debt.name,
        source: "SYSTEM",
      },
    });
    await applyBalanceDelta(tx, account.id, money(input.amount));
    await tx.debt.update({ where: { id: debt.id }, data: { disbursementAccountId: account.id } });
    await writeAudit(tx, { userId, action: "DEBT_UPDATED", entityType: "Debt", entityId: debt.id, metadata: { disbursement: { accountId: account.id, amount: input.amount, date: input.date } } });
  });
}

/** Moves the open payments of a debt off weekends and holidays (or back to the contract dates). */
export async function setDebtWeekendShift(userId: string, input: { id: string; shiftWeekends: boolean }): Promise<{ moved: number }> {
  return prisma.$transaction(async (tx) => {
    const debt = await lockOwnedDebt(tx, userId, input.id);
    const result = await setWeekendShift(tx, debt, input.shiftWeekends);
    await writeAudit(tx, { userId, action: "DEBT_UPDATED", entityType: "Debt", entityId: debt.id, metadata: { shiftWeekends: input.shiftWeekends, moved: result.moved } });
    return result;
  });
}

export async function setDebtArchived(userId: string, id: string, archived: boolean) {
  await prisma.$transaction(async (tx) => {
    const debt = await tx.debt.findFirst({ where: { id, userId } });
    if (!debt) throw new NotFoundError("Debt");
    let status: Debt["status"] = "ARCHIVED";
    if (!archived) {
      const open = await tx.debtScheduleItem.count({ where: { debtId: id, isCurrent: true, status: { in: ["SCHEDULED", "PARTIALLY_PAID"] } } });
      status = money(debt.currentPrincipal).isZero() && open === 0 ? "PAID_OFF" : "ACTIVE";
    }
    await tx.debt.update({ where: { id }, data: { status } });
    await writeAudit(tx, { userId, action: archived ? "DEBT_ARCHIVED" : "DEBT_UNARCHIVED", entityType: "Debt", entityId: id });
  });
}

/** Integrity: currentPrincipal recomputed from source facts. */
export async function recomputeDebtPrincipal(userId: string, debtId: string): Promise<string> {
  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt) throw new NotFoundError("Debt");
  const paid = await prisma.debtPayment.aggregate({
    where: { debtId, userId, reversedAt: null },
    _sum: { principalAmount: true },
  });
  return toMoneyString(money(debt.principalBasis).minus(money(debt.paidBeforeTracking)).minus(money(paid._sum.principalAmount ?? 0)));
}


export type DebtTotalsDTO = {
  currency: string;
  principalBasis: string;
  paidPrincipal: string;
  remainingPrincipal: string;
  paidPercent: string;
  remainingPercent: string;
  remainingInterestEstimate: string;
  plannedFutureTotal: string;
  hasEstimates: boolean;
};

/** Total Debt widget (SPEC §10): per currency, principal kept apart from future interest. */
export function debtTotalsByCurrency(debts: DebtSummaryDTO[]): DebtTotalsDTO[] {
  const groups = new Map<string, DebtSummaryDTO[]>();
  for (const d of debts) groups.set(d.currency, [...(groups.get(d.currency) ?? []), d]);
  return [...groups].map(([currency, list]) => {
    const sum = (key: "principalBasis" | "paidPrincipal" | "currentPrincipal" | "remainingInterestEstimate" | "plannedFutureTotal") =>
      list.reduce((s, d) => s.plus(money(d[key])), money(0));
    const basis = sum("principalBasis");
    const paid = sum("paidPrincipal");
    const paidPct = basis.isZero() ? money(0) : paid.div(basis).times(100);
    return {
      currency,
      principalBasis: toMoneyString(basis),
      paidPrincipal: toMoneyString(paid),
      remainingPrincipal: toMoneyString(sum("currentPrincipal")),
      paidPercent: paidPct.toDecimalPlaces(2).toFixed(2),
      remainingPercent: (basis.isZero() ? money(0) : money(100).minus(paidPct)).toDecimalPlaces(2).toFixed(2),
      remainingInterestEstimate: toMoneyString(sum("remainingInterestEstimate")),
      plannedFutureTotal: toMoneyString(sum("plannedFutureTotal")),
      hasEstimates: list.some((d) => d.hasEstimates),
    };
  });
}
