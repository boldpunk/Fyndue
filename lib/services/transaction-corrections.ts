import "server-only";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { dbToLocalDate, localDateToDb, type LocalDate } from "@/lib/finance/dates";
import { money, toMoneyString } from "@/lib/finance/money";
import { applyBalanceDelta, assertTrackedDate, lockOwnedAccount } from "./accounts";
import { writeAudit } from "./audit";
import { lockOwnedTransaction } from "./transactions";

/**
 * Fixing operations the regular form doesn't edit (docs/roadmap.md):
 * - a debt payment: its date (the debt's history moves with it);
 * - a loan disbursement: date, amount and the account it arrived on;
 * - a balance adjustment: its date.
 * Expenses, income and transfers are edited by the operation form.
 */
export type CorrectionInput = { id: string; date: LocalDate; amount?: string; accountId?: string };

export async function correctTransaction(userId: string, input: CorrectionInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = await lockOwnedTransaction(tx, userId, input.id);
    if (t.voidedAt) throw new DomainError("Аннулированную операцию нельзя изменить.", "VOIDED");
    const before = { date: dbToLocalDate(t.transactionDate), amount: toMoneyString(t.amount), accountId: t.accountId };

    if (t.type === "DEBT_PAYMENT" || t.type === "BALANCE_ADJUSTMENT") {
      if (input.amount !== undefined || (input.accountId && input.accountId !== t.accountId)) {
        throw new DomainError(
          t.type === "DEBT_PAYMENT" ? "У платежа по долгу меняется только дата. Сумму исправьте, отменив платёж на вкладке «Платежи» долга." : "У корректировки меняется только дата.",
        );
      }
      const account = await lockOwnedAccount(tx, userId, t.accountId);
      assertTrackedDate(account, input.date);
      if (t.type === "DEBT_PAYMENT") {
        const payment = t.debtPaymentId ? await tx.debtPayment.findFirst({ where: { id: t.debtPaymentId, userId } }) : null;
        if (!payment) throw new NotFoundError("Payment");
        if (payment.isEarlyRepayment) {
          throw new DomainError("Досрочное погашение пересчитало график от своей даты. Отмените его на вкладке «Платежи» долга и внесите заново с нужной датой.");
        }
        const debt = await tx.debt.findFirstOrThrow({ where: { id: payment.debtId, userId } });
        if (input.date < dbToLocalDate(debt.startDate)) throw new DomainError("Дата платежа раньше начала долга.", "VALIDATION", { date: "Раньше начала долга" });
        await tx.debtPayment.update({ where: { id: payment.id }, data: { paymentDate: localDateToDb(input.date) } });
      }
      await tx.transaction.update({ where: { id: t.id }, data: { transactionDate: localDateToDb(input.date) } });
    } else if (t.type === "LOAN_DISBURSEMENT") {
      const amount = input.amount ?? before.amount;
      if (!money(amount).gt(0)) throw new DomainError("Сумма должна быть больше нуля.", "VALIDATION", { amount: "Больше нуля" });
      const debt = t.debtId ? await tx.debt.findFirst({ where: { id: t.debtId, userId } }) : null;
      if (!debt) throw new NotFoundError("Debt");
      const targetId = input.accountId ?? t.accountId;
      const target = await lockOwnedAccount(tx, userId, targetId);
      if (target.isArchived && targetId !== t.accountId) throw new DomainError("Этот счёт в архиве.", "ACCOUNT_ARCHIVED", { accountId: "Счёт в архиве" });
      if (target.currency !== debt.currency) throw new DomainError(`Счёт должен быть в ${debt.currency}.`, "CURRENCY_MISMATCH", { accountId: `Выберите счёт в ${debt.currency}` });
      assertTrackedDate(target, input.date);
      if (targetId !== t.accountId) {
        const old = await lockOwnedAccount(tx, userId, t.accountId);
        assertTrackedDate(old, before.date);
      }
      // Take the old money off the old account, put the corrected money on the (new) one.
      await applyBalanceDelta(tx, t.accountId, money(before.amount).negated());
      await applyBalanceDelta(tx, targetId, money(amount));
      await tx.transaction.update({ where: { id: t.id }, data: { transactionDate: localDateToDb(input.date), amount, accountId: targetId } });
      await tx.debt.update({ where: { id: debt.id }, data: { disbursementAccountId: targetId, netAmountReceived: amount } });
    } else {
      throw new DomainError("Эту операцию меняйте в форме «Изменить» ниже.");
    }

    await writeAudit(tx, {
      userId,
      action: "TRANSACTION_UPDATED",
      entityType: "Transaction",
      entityId: t.id,
      metadata: { type: t.type, before, after: { date: input.date, amount: input.amount ?? before.amount, accountId: input.accountId ?? before.accountId } },
    });
  });
}
