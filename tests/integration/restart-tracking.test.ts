import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { adjustAccountBalance, getAccount, recomputeAccountBalance } from "@/lib/services/accounts";
import { createTransaction, listTransactions, restartAccountTracking } from "@/lib/services/transactions";
import { balanceOf, categoryId, createTestAccount, createUser, resetDatabase } from "../support/factories";

const spend = async (userId: string, accountId: string, category: string, amount: string, date: string, merchant?: string) =>
  createTransaction(userId, { kind: "EXPENSE", accountId, categoryId: await categoryId(userId, category), amount, date, merchant, note: undefined, clientRequestId: randomUUID() });

describe("restart account tracking", () => {
  beforeEach(resetDatabase);

  it("clears corrections and pre-start payments, keeps real spending, and lands on the bank balance", async () => {
    const user = await createUser();
    const visa = await createTestAccount(user.id, { name: "Личная - Visa", currency: "USD", openingBalance: "35.95" });
    const uzcard = await createTestAccount(user.id, { name: "Личная - Uzcard", openingBalance: "500000" });
    await spend(user.id, visa.id, "Подписки", "22.40", "2026-10-01");
    await adjustAccountBalance(user.id, { accountId: visa.id, targetBalance: "8", date: "2026-10-02" });
    await adjustAccountBalance(user.id, { accountId: visa.id, targetBalance: "30.40", date: "2026-10-02" });
    await spend(user.id, visa.id, "eSIM и роуминг", "4.32", "2026-10-02", "Yesim");
    await spend(user.id, visa.id, "Продукты", "8.36", "2026-10-03", "Snacks - CAN store");
    await spend(user.id, visa.id, "Кафе и рестораны", "4.59", "2026-10-04", "Starbucks");
    // A transfer is kept even if it is before the start: it belongs to two accounts.
    await createTransaction(user.id, { kind: "TRANSFER", fromAccountId: uzcard.id, toAccountId: visa.id, amount: "120000", toAmount: "10", date: "2026-09-30", note: undefined, clientRequestId: randomUUID() });

    const result = await restartAccountTracking(user.id, { accountId: visa.id, actualBalance: "10", startDate: "2026-10-02", removeAdjustments: true });
    expect(result.voided).toBe(3); // two corrections + the 1 October payment
    expect(await balanceOf(visa.id)).toBe("10.00");
    expect(await recomputeAccountBalance(user.id, visa.id)).toBe("10.00");
    // 10 = opening − 4.32 − 8.36 − 4.59 + 10 (transfer)  →  opening 17.27
    expect(result.openingBalance).toBe("17.27");
    expect((await getAccount(user.id, visa.id)).trackingStartDate).toBe("2026-10-02");
    expect(await balanceOf(uzcard.id)).toBe("380000.00");

    const { items } = await listTransactions(user.id, { page: 1, account: visa.id });
    expect(items.filter((t) => !t.isVoided).map((t) => t.merchant ?? t.type)).toEqual(["Starbucks", "Snacks - CAN store", "Yesim", "TRANSFER"]);
    const voided = await prisma.transaction.findMany({ where: { accountId: visa.id, voidedAt: { not: null } } });
    expect(voided.every((t) => t.voidReason === "Учёт начат заново")).toBe(true);
  });

  it("refuses operations dated before the start, and accepts them from the start", async () => {
    const user = await createUser();
    const visa = await createTestAccount(user.id, { name: "Visa", currency: "USD", openingBalance: "10" });
    const uzcard = await createTestAccount(user.id, { name: "Uzcard", openingBalance: "100000" });
    await restartAccountTracking(user.id, { accountId: visa.id, actualBalance: "10", startDate: "2026-10-02", removeAdjustments: true });

    await expect(spend(user.id, visa.id, "Подписки", "22.40", "2026-10-01")).rejects.toThrow(/Учёт по счёту «Visa» начат 2 октября/);
    await expect(adjustAccountBalance(user.id, { accountId: visa.id, targetBalance: "5", date: "2026-09-30" })).rejects.toThrow(/начат/);
    await expect(
      createTransaction(user.id, { kind: "TRANSFER", fromAccountId: uzcard.id, toAccountId: visa.id, amount: "12000", toAmount: "1", date: "2026-10-01", note: undefined, clientRequestId: randomUUID() }),
    ).rejects.toThrow(/начат/);
    await spend(user.id, visa.id, "Подписки", "2", "2026-10-02");
    expect(await balanceOf(visa.id)).toBe("8.00");
    // Other accounts are not affected.
    await spend(user.id, uzcard.id, "Продукты", "1000", "2026-09-01");
    expect(await balanceOf(uzcard.id)).toBe("99000.00");
  });

  it("can keep corrections, and is scoped to the owner", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { name: "Uzcard", openingBalance: "1000" });
    await adjustAccountBalance(user.id, { accountId: card.id, targetBalance: "1500", date: "2026-10-03" });
    const kept = await restartAccountTracking(user.id, { accountId: card.id, actualBalance: "1072.36", startDate: "2026-10-02", removeAdjustments: false });
    expect(kept).toEqual({ voided: 0, openingBalance: "572.36" });
    expect(await recomputeAccountBalance(user.id, card.id)).toBe("1072.36");

    const other = await createUser("Other");
    await expect(restartAccountTracking(other.id, { accountId: card.id, actualBalance: "0", startDate: "2026-10-02", removeAdjustments: true })).rejects.toBeInstanceOf(NotFoundError);
    expect(await balanceOf(card.id)).toBe("1072.36");
  });
});
