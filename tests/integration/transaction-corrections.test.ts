import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { recordDebtPayment } from "@/lib/services/debt-payments";
import { recordDebtDisbursement } from "@/lib/services/debts";
import { correctTransaction } from "@/lib/services/transaction-corrections";
import { createTransaction } from "@/lib/services/transactions";
import { createTestDebt, zeroBreakdown } from "../support/debt-factories";
import { balanceOf, categoryId, createTestAccount, createUser, requestId, resetDatabase } from "../support/factories";

describe("correcting operations the form doesn't edit", () => {
  beforeEach(resetDatabase);

  it("moves a debt payment to another date — the payment and its account row together", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000.00" });
    const { id: debtId } = await createTestDebt(user.id);
    const { id: paymentId } = await recordDebtPayment(user.id, { clientRequestId: randomUUID(), debtId, accountId: card.id, paymentDate: "2026-10-06", settlesItem: false, note: undefined, ...zeroBreakdown, principal: "1000.00" });
    const row = await prisma.transaction.findFirstOrThrow({ where: { debtPaymentId: paymentId } });

    await correctTransaction(user.id, { id: row.id, date: "2026-10-07" });
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: row.id } })).transactionDate.toISOString().slice(0, 10)).toBe("2026-10-07");
    expect((await prisma.debtPayment.findUniqueOrThrow({ where: { id: paymentId } })).paymentDate.toISOString().slice(0, 10)).toBe("2026-10-07");
    expect(await balanceOf(card.id)).toBe("99000.00");
    await expect(correctTransaction(user.id, { id: row.id, date: "2026-10-07", amount: "5.00" })).rejects.toThrow("только дата");
  });

  it("fixes a loan disbursement's date, amount and account, moving the money", async () => {
    const user = await createUser();
    const uzum = await createTestAccount(user.id, { name: "Uzum" });
    const uzcard = await createTestAccount(user.id, { name: "Uzcard" });
    const { id: debtId } = await createTestDebt(user.id);
    await recordDebtDisbursement(user.id, { id: debtId, accountId: uzum.id, amount: "5300000.00", date: "2026-10-06" });
    const row = await prisma.transaction.findFirstOrThrow({ where: { debtId, type: "LOAN_DISBURSEMENT" } });

    await correctTransaction(user.id, { id: row.id, date: "2026-10-07", amount: "5650000.00", accountId: uzcard.id });
    expect(await balanceOf(uzum.id)).toBe("0.00");
    expect(await balanceOf(uzcard.id)).toBe("5650000.00");
    expect(await prisma.debt.findUniqueOrThrow({ where: { id: debtId } })).toMatchObject({ disbursementAccountId: uzcard.id });
  });

  it("only the owner, never a regular expense (that has its own form)", async () => {
    const user = await createUser();
    const other = await createUser();
    const card = await createTestAccount(user.id);
    const expense = await createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: await categoryId(user.id, "Такси"), amount: "1.00", date: "2026-10-06", clientRequestId: requestId() });
    await expect(correctTransaction(user.id, { id: expense.id, date: "2026-10-07" })).rejects.toThrow("форме");
    await expect(correctTransaction(other.id, { id: expense.id, date: "2026-10-07" })).rejects.toThrow(DomainError);
  });
});
