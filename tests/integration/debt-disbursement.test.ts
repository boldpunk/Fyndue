import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { getDebtDetail, recordDebtDisbursement } from "@/lib/services/debts";
import { createTestDebt } from "../support/debt-factories";
import { balanceOf, createTestAccount, createUser, resetDatabase } from "../support/factories";

describe("loan money received after the debt was added", () => {
  beforeEach(resetDatabase);

  it("puts the money on the account once, as a loan disbursement (not income)", async () => {
    const user = await createUser();
    const uzum = await createTestAccount(user.id, { name: "Uzum", openingBalance: "100000.00" });
    const { id } = await createTestDebt(user.id);
    const debt = await getDebtDetail(user.id, id);
    expect(debt.disbursementAccountId).toBeNull();

    await recordDebtDisbursement(user.id, { id, accountId: uzum.id, amount: "5650000.00", date: debt.startDate });
    expect(await balanceOf(uzum.id)).toBe("5750000.00");
    const row = await prisma.transaction.findFirstOrThrow({ where: { debtId: id, type: "LOAN_DISBURSEMENT" } });
    expect(row).toMatchObject({ accountId: uzum.id, direction: "INFLOW" });
    expect((await getDebtDetail(user.id, id)).disbursementAccountId).toBe(uzum.id);

    await expect(recordDebtDisbursement(user.id, { id, accountId: uzum.id, amount: "1.00", date: debt.startDate })).rejects.toThrow("уже записано");
  });

  it("refuses someone else's debt or account and a wrong currency", async () => {
    const user = await createUser();
    const other = await createUser();
    const mine = await createTestAccount(user.id);
    const usd = await createTestAccount(user.id, { currency: "USD" });
    const theirs = await createTestAccount(other.id);
    const { id } = await createTestDebt(user.id);
    const date = (await getDebtDetail(user.id, id)).startDate;
    await expect(recordDebtDisbursement(other.id, { id, accountId: theirs.id, amount: "1.00", date })).rejects.toThrow(DomainError);
    await expect(recordDebtDisbursement(user.id, { id, accountId: theirs.id, amount: "1.00", date })).rejects.toThrow(DomainError);
    await expect(recordDebtDisbursement(user.id, { id, accountId: usd.id, amount: "1.00", date })).rejects.toThrow("Счёт должен быть");
    expect(await balanceOf(mine.id)).toBe("0.00");
  });
});
