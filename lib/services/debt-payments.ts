import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { dbToLocalDate, localDateToDb, type LocalDate } from "@/lib/finance/dates";
import { money, toMoneyString, ZERO } from "@/lib/finance/money";
import { itemRemaining, paymentTotals, validatePaymentBreakdown, type PaymentBreakdown } from "@/lib/finance/payment-allocation";
import type { Debt, DebtScheduleItem } from "@/lib/generated/prisma/client";
import type { EarlyRepaymentInput, RecordPaymentInput } from "@/lib/validations/debts";
import { applyBalanceDelta, lockOwnedAccount } from "./accounts";
import { writeAudit } from "./audit";
import { itemToLine, planForSplit, refreshDebtState, splitCurrentSchedule, writeNewScheduleVersion } from "./debt-schedule";
import { isUniqueViolation } from "./prisma-errors";

/** Loads a debt owned by `userId` and locks its row: payments on one debt are serialised. */
export async function lockOwnedDebt(tx: Tx, userId: string, id: string): Promise<Debt> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Debt" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("Debt");
  return tx.debt.findFirstOrThrow({ where: { id, userId } });
}

async function debtPaymentsCategoryId(tx: Tx, userId: string): Promise<string | null> {
  const category = await tx.category.findFirst({ where: { userId, isSystem: true, type: "EXPENSE" }, select: { id: true } });
  return category?.id ?? null;
}

async function payingAccount(tx: Tx, userId: string, accountId: string, debt: Debt) {
  const account = await lockOwnedAccount(tx, userId, accountId);
  if (account.isArchived) throw new DomainError("Этот счёт в архиве.", "ACCOUNT_ARCHIVED", { accountId: "Счёт в архиве" });
  if (account.currency !== debt.currency) {
    throw new DomainError(`Долг в ${debt.currency} оплачивается со счёта в ${debt.currency}.`, "CURRENCY_MISMATCH", {
      accountId: `Выберите счёт в ${debt.currency}`,
    });
  }
  return account;
}

function assertPayable(debt: Debt) {
  if (debt.status === "ARCHIVED") throw new DomainError("Этот долг в архиве.", "DEBT_ARCHIVED");
  if (debt.status === "PAID_OFF") throw new DomainError("Этот долг уже погашен.", "DEBT_PAID_OFF");
}

type StoredPayment = {
  debt: Debt;
  accountId: string;
  item: DebtScheduleItem | null;
  paymentDate: LocalDate;
  breakdown: PaymentBreakdown;
  settlesItem: boolean;
  isEarlyRepayment: boolean;
  strategy: "REDUCE_TERM" | "REDUCE_PAYMENT" | null;
  note?: string;
  clientRequestId: string;
};

/**
 * The shared write path of SPEC §22, steps 2–9: payment row, linked account
 * transaction (real debit), balance, schedule line, principal. Caller holds
 * the debt lock and handles regeneration/audit.
 */
async function storePayment(tx: Tx, userId: string, p: StoredPayment) {
  const totals = paymentTotals(p.breakdown);
  const b = p.breakdown;
  const payment = await tx.debtPayment.create({
    data: {
      userId,
      debtId: p.debt.id,
      scheduleItemId: p.item?.id ?? null,
      accountId: p.accountId,
      paymentDate: localDateToDb(p.paymentDate),
      amountAppliedToDebt: totals.amountAppliedToDebt.toFixed(2),
      actualAccountDebit: totals.actualAccountDebit.toFixed(2),
      principalAmount: money(b.principal).toFixed(2),
      interestAmount: money(b.interest).toFixed(2),
      originationFeeAmount: money(b.originationFee).toFixed(2),
      paymentProcessingFeeAmount: money(b.processingFee).toFixed(2),
      penaltyAmount: money(b.penalty).toFixed(2),
      otherFeeAmount: money(b.otherFee).toFixed(2),
      isEarlyRepayment: p.isEarlyRepayment,
      earlyRepaymentStrategy: p.strategy,
      note: p.note ?? null,
      clientRequestId: p.clientRequestId,
    },
  });

  // The account engine sees only the real debit (SPEC §19A accounting rule).
  await tx.transaction.create({
    data: {
      userId,
      accountId: p.accountId,
      categoryId: await debtPaymentsCategoryId(tx, userId),
      debtId: p.debt.id,
      debtPaymentId: payment.id,
      type: "DEBT_PAYMENT",
      direction: "OUTFLOW",
      amount: totals.actualAccountDebit.toFixed(2),
      currency: p.debt.currency,
      transactionDate: localDateToDb(p.paymentDate),
      note: p.debt.name,
      source: "SYSTEM",
    },
  });
  await applyBalanceDelta(tx, p.accountId, totals.actualAccountDebit.negated());

  if (p.item) {
    const principal = money(b.principal);
    const interest = money(b.interest);
    const fees = money(b.originationFee).plus(money(b.otherFee));
    const paidPrincipal = money(p.item.paidPrincipal).plus(principal);
    const paidTotal = money(p.item.paidTotal).plus(principal).plus(interest).plus(fees);
    const settled = paidTotal.gte(money(p.item.plannedTotal)) || (p.settlesItem && paidPrincipal.gte(money(p.item.plannedPrincipal)));
    await tx.debtScheduleItem.update({
      where: { id: p.item.id },
      data: {
        paidPrincipal: paidPrincipal.toFixed(2),
        paidInterest: money(p.item.paidInterest).plus(interest).toFixed(2),
        paidFees: money(p.item.paidFees).plus(fees).toFixed(2),
        paidTotal: paidTotal.toFixed(2),
        status: settled ? "PAID" : "PARTIALLY_PAID",
      },
    });
  }

  // The debt engine reduces principal only by the principal component.
  if (money(b.principal).gt(0)) {
    await tx.debt.update({ where: { id: p.debt.id }, data: { currentPrincipal: { decrement: money(b.principal).toFixed(2) } } });
  }
  return { payment, totals };
}

async function findByRequestId(userId: string, clientRequestId: string) {
  return prisma.debtPayment.findFirst({ where: { userId, clientRequestId }, select: { id: true } });
}

async function idempotent(userId: string, clientRequestId: string, run: () => Promise<{ id: string }>) {
  const existing = await findByRequestId(userId, clientRequestId);
  if (existing) return existing;
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error, "clientRequestId")) {
      const winner = await findByRequestId(userId, clientRequestId);
      if (winner) return winner;
    }
    throw error;
  }
}

/** Mark as paid / partial payment (SPEC §22, §23). One DB transaction. */
export async function recordDebtPayment(userId: string, input: RecordPaymentInput): Promise<{ id: string }> {
  return idempotent(userId, input.clientRequestId, () =>
    prisma.$transaction(
      async (tx) => {
        const debt = await lockOwnedDebt(tx, userId, input.debtId);
        assertPayable(debt);
        const account = await payingAccount(tx, userId, input.accountId, debt);

        let item: DebtScheduleItem | null = null;
        if (input.scheduleItemId) {
          item = await tx.debtScheduleItem.findFirst({ where: { id: input.scheduleItemId, debtId: debt.id, userId, isCurrent: true } });
          if (!item) throw new NotFoundError("Installment");
          if (item.status !== "SCHEDULED" && item.status !== "PARTIALLY_PAID") {
            throw new DomainError("Этот платёж уже закрыт.", "ITEM_SETTLED");
          }
        }

        const breakdown: PaymentBreakdown = input;
        const errors = validatePaymentBreakdown(breakdown, {
          currentPrincipal: debt.currentPrincipal,
          item: item ? itemRemaining(item) : undefined,
        });
        if (Object.keys(errors).length) {
          throw new DomainError(errors.form ?? Object.values(errors)[0]!, "INVALID_PAYMENT", errors);
        }

        const { payment, totals } = await storePayment(tx, userId, {
          debt,
          accountId: account.id,
          item,
          paymentDate: input.paymentDate,
          breakdown,
          settlesItem: input.settlesItem,
          isEarlyRepayment: false,
          strategy: null,
          note: input.note,
          clientRequestId: input.clientRequestId,
        });
        await refreshDebtState(tx, debt.id);
        await writeAudit(tx, {
          userId,
          action: "PAYMENT_RECORDED",
          entityType: "DebtPayment",
          entityId: payment.id,
          metadata: {
            debtId: debt.id,
            scheduleItemId: item?.id ?? null,
            applied: totals.amountAppliedToDebt.toFixed(2),
            debit: totals.actualAccountDebit.toFixed(2),
            principal: money(input.principal).toFixed(2),
          },
        });
        return { id: payment.id };
      },
      { timeout: 15_000 },
    ),
  );
}

export type EarlyRepaymentPreview = {
  principalBefore: string;
  principalAfter: string;
  oldPayoffDate: string | null;
  newPayoffDate: string | null;
  monthsReduced: number;
  oldInterest: string;
  newInterest: string;
  interestSavedEstimate: string;
  newLines: { installmentNumber: number; dueDate: string; principal: string; interest: string; fees: string; total: string }[];
  isEstimate: boolean;
};

/** Read-only before/after comparison for an extra principal payment (SPEC §24). */
export async function previewEarlyRepayment(
  userId: string,
  input: { debtId: string; amount: string; strategy: "REDUCE_TERM" | "REDUCE_PAYMENT" },
): Promise<EarlyRepaymentPreview> {
  return prisma.$transaction(async (tx) => {
    const debt = await tx.debt.findFirst({ where: { id: input.debtId, userId } });
    if (!debt) throw new NotFoundError("Debt");
    assertPayable(debt);
    const split = await splitCurrentSchedule(tx, debt);
    const amount = money(input.amount);
    if (amount.gt(money(debt.currentPrincipal))) {
      throw new DomainError("Больше остатка основного долга.", "INVALID_PAYMENT", { amount: "Больше остатка основного долга" });
    }
    const principalAfter = split.principalToPlan.minus(amount);
    if (principalAfter.lt(0)) {
      throw new DomainError("Сначала закройте частично оплаченный платёж.", "INVALID_PAYMENT", { amount: "Больше остатка основного долга вне графика" });
    }
    const plan = planForSplit(debt, split, principalAfter, input.strategy);
    return {
      principalBefore: toMoneyString(debt.currentPrincipal),
      principalAfter: toMoneyString(money(debt.currentPrincipal).minus(amount)),
      oldPayoffDate: plan.oldPayoffDate,
      newPayoffDate: plan.newPayoffDate,
      monthsReduced: plan.monthsReduced,
      oldInterest: toMoneyString(plan.oldInterest),
      newInterest: toMoneyString(plan.newInterest),
      interestSavedEstimate: toMoneyString(plan.interestSaved),
      newLines: plan.lines.map((l) => ({
        installmentNumber: l.installmentNumber,
        dueDate: l.dueDate,
        principal: toMoneyString(l.principal),
        interest: toMoneyString(l.interest),
        fees: toMoneyString(l.fees),
        total: toMoneyString(l.total),
      })),
      isEstimate: debt.repaymentType === "DIFFERENTIAL" || debt.repaymentType === "ANNUITY",
    };
  });
}

/**
 * Extra principal payment (SPEC §24): reduces principal, then regenerates the
 * open part of the schedule as a new version. The old version is kept.
 */
export async function recordEarlyRepayment(userId: string, input: EarlyRepaymentInput): Promise<{ id: string }> {
  return idempotent(userId, input.clientRequestId, () =>
    prisma.$transaction(
      async (tx) => {
        const debt = await lockOwnedDebt(tx, userId, input.debtId);
        assertPayable(debt);
        const account = await payingAccount(tx, userId, input.accountId, debt);
        const amount = money(input.amount);
        const splitBefore = await splitCurrentSchedule(tx, debt);
        if (amount.gt(money(debt.currentPrincipal))) {
          throw new DomainError("Больше остатка основного долга.", "INVALID_PAYMENT", { amount: "Больше остатка основного долга" });
        }
        if (amount.gt(splitBefore.principalToPlan)) {
          throw new DomainError("Сначала закройте частично оплаченный платёж.", "INVALID_PAYMENT", { amount: "Больше остатка основного долга вне графика" });
        }

        const { payment, totals } = await storePayment(tx, userId, {
          debt,
          accountId: account.id,
          item: null,
          paymentDate: input.paymentDate,
          breakdown: { principal: input.amount, interest: "0", originationFee: "0", processingFee: input.processingFee, penalty: "0", otherFee: "0" },
          settlesItem: false,
          isEarlyRepayment: true,
          strategy: input.strategy,
          note: input.note,
          clientRequestId: input.clientRequestId,
        });

        const updatedDebt = await tx.debt.findUniqueOrThrow({ where: { id: debt.id } });
        const split = await splitCurrentSchedule(tx, updatedDebt);
        const plan = planForSplit(updatedDebt, split, split.principalToPlan, input.strategy);
        const versionId = await writeNewScheduleVersion(tx, updatedDebt, split, plan.lines, {
          reason: "EARLY_REPAYMENT",
          note: `${input.strategy === "REDUCE_TERM" ? "Сокращение срока" : "Уменьшение платежа"} · досрочно ${amount.toFixed(2)}`,
          isEstimate: updatedDebt.repaymentType === "DIFFERENTIAL" || updatedDebt.repaymentType === "ANNUITY",
        });
        await tx.debtPayment.update({ where: { id: payment.id }, data: { resultingScheduleVersionId: versionId } });
        await writeAudit(tx, {
          userId,
          action: "EARLY_REPAYMENT",
          entityType: "DebtPayment",
          entityId: payment.id,
          metadata: {
            debtId: debt.id,
            principal: amount.toFixed(2),
            debit: totals.actualAccountDebit.toFixed(2),
            strategy: input.strategy,
            oldPayoffDate: plan.oldPayoffDate,
            newPayoffDate: plan.newPayoffDate,
          },
        });
        return { id: payment.id };
      },
      { timeout: 15_000 },
    ),
  );
}

/**
 * Reverse Payment (SPEC §25) — never a delete. Restores the account balance,
 * the principal and the schedule line; for an early repayment, restores the
 * previous schedule as a new CORRECTION version. One DB transaction.
 */
export async function reverseDebtPayment(userId: string, input: { paymentId: string; reason: string }): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const found = await tx.debtPayment.findFirst({ where: { id: input.paymentId, userId }, select: { debtId: true } });
      if (!found) throw new NotFoundError("Payment");
      const debt = await lockOwnedDebt(tx, userId, found.debtId);
      const payment = await tx.debtPayment.findFirstOrThrow({ where: { id: input.paymentId, userId }, include: { transaction: true } });
      if (payment.reversedAt) throw new DomainError("Этот платёж уже отменён.", "ALREADY_REVERSED");

      if (payment.isEarlyRepayment && payment.resultingScheduleVersionId) {
        // Keep version history linear: only the latest change can be undone.
        if (debt.activeScheduleVersionId !== payment.resultingScheduleVersionId) {
          throw new DomainError("После этого досрочного погашения график менялся. Сначала отмените более поздние изменения.", "NOT_LATEST");
        }
        const laterPayments = await tx.debtPayment.count({
          where: { debtId: debt.id, reversedAt: null, scheduleItem: { scheduleVersionId: payment.resultingScheduleVersionId } },
        });
        if (laterPayments > 0) {
          throw new DomainError("По новому графику уже есть платежи. Сначала отмените их.", "NOT_LATEST");
        }
      }

      const reversedAt = new Date();
      await tx.debtPayment.update({ where: { id: payment.id }, data: { reversedAt, reversalReason: input.reason } });

      // Reverse the linked account transaction and restore the balance.
      if (payment.transaction) {
        await lockOwnedAccount(tx, userId, payment.transaction.accountId);
        await tx.transaction.update({ where: { id: payment.transaction.id }, data: { voidedAt: reversedAt, voidReason: `Платёж отменён: ${input.reason}` } });
        await applyBalanceDelta(tx, payment.transaction.accountId, money(payment.actualAccountDebit));
      }

      // Reopen the schedule line.
      if (payment.scheduleItemId) {
        const item = await tx.debtScheduleItem.findUniqueOrThrow({ where: { id: payment.scheduleItemId } });
        const fees = money(payment.originationFeeAmount).plus(money(payment.otherFeeAmount));
        const paidTotal = money(item.paidTotal).minus(money(payment.principalAmount)).minus(money(payment.interestAmount)).minus(fees);
        await tx.debtScheduleItem.update({
          where: { id: item.id },
          data: {
            paidPrincipal: money(item.paidPrincipal).minus(money(payment.principalAmount)).toFixed(2),
            paidInterest: money(item.paidInterest).minus(money(payment.interestAmount)).toFixed(2),
            paidFees: money(item.paidFees).minus(fees).toFixed(2),
            paidTotal: paidTotal.toFixed(2),
            status: paidTotal.lte(0) ? "SCHEDULED" : paidTotal.gte(money(item.plannedTotal)) ? "PAID" : "PARTIALLY_PAID",
          },
        });
      }

      // Restore principal.
      if (money(payment.principalAmount).gt(0)) {
        await tx.debt.update({ where: { id: debt.id }, data: { currentPrincipal: { increment: money(payment.principalAmount).toFixed(2) } } });
      }

      if (payment.isEarlyRepayment && payment.resultingScheduleVersionId) {
        // Bring back the lines the early repayment replaced, as a new version.
        const replaced = await tx.debtScheduleItem.findMany({
          where: { debtId: debt.id, supersededByVersionId: payment.resultingScheduleVersionId },
          orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
        });
        const updatedDebt = await tx.debt.findUniqueOrThrow({ where: { id: debt.id } });
        const split = await splitCurrentSchedule(tx, updatedDebt);
        await writeNewScheduleVersion(tx, updatedDebt, split, replaced.map(itemToLine), {
          reason: "CORRECTION",
          note: `Досрочное погашение от ${dbToLocalDate(payment.paymentDate)} отменено`,
          isEstimate: replaced.some((i) => i.isEstimate),
        });
      } else {
        await refreshDebtState(tx, debt.id);
      }

      await writeAudit(tx, {
        userId,
        action: "PAYMENT_REVERSED",
        entityType: "DebtPayment",
        entityId: payment.id,
        metadata: {
          debtId: debt.id,
          principal: toMoneyString(payment.principalAmount),
          debit: toMoneyString(payment.actualAccountDebit),
          wasEarlyRepayment: payment.isEarlyRepayment,
        },
      });
    },
    { timeout: 15_000 },
  );
}

/** Integrity check helper used by tests. */
export async function recomputeItemPaidTotal(userId: string, itemId: string): Promise<string> {
  const payments = await prisma.debtPayment.findMany({ where: { userId, scheduleItemId: itemId, reversedAt: null } });
  return toMoneyString(
    payments.reduce(
      (sum, p) => sum.plus(money(p.principalAmount)).plus(money(p.interestAmount)).plus(money(p.originationFeeAmount)).plus(money(p.otherFeeAmount)),
      ZERO,
    ),
  );
}
