import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { adjustAccountBalance, recomputeAccountBalance } from "@/lib/services/accounts";
import { adjustBalanceByTransfer, convertAdjustmentToTransfer, getTransaction, listTransactions } from "@/lib/services/transactions";
import { balanceOf, createTestAccount, createUser, resetDatabase } from "../support/factories";

async function setup() {
  const user = await createUser();
  const uzcard = await createTestAccount(user.id, { name: "Uzcard", openingBalance: "5000000" });
  const visa = await createTestAccount(user.id, { name: "Личная - Visa", currency: "USD", openingBalance: "10" });
  return { user, uzcard, visa };
}

const consistent = async (userId: string, ...ids: string[]) => {
  for (const id of ids) expect(await recomputeAccountBalance(userId, id)).toBe(await balanceOf(id));
};

describe("adjustment → conversion", () => {
  beforeEach(resetDatabase);

  it("a top-up adjustment becomes dollars bought with sums; the dollar balance stays, the sum card pays", async () => {
    const { user, uzcard, visa } = await setup();
    const adjId = await adjustAccountBalance(user.id, { accountId: visa.id, targetBalance: "32.40", date: "2026-10-02" });
    expect(await balanceOf(visa.id)).toBe("32.40");

    const { id } = await convertAdjustmentToTransfer(user.id, { id: adjId!, counterpartAccountId: uzcard.id, counterpartAmount: "285000" });
    expect(await balanceOf(visa.id)).toBe("32.40");
    expect(await balanceOf(uzcard.id)).toBe("4715000.00");

    const adj = await prisma.transaction.findUniqueOrThrow({ where: { id: adjId! } });
    expect(adj.voidedAt).not.toBeNull();
    expect(adj.voidReason).toBe("Заменена конвертацией");

    const transfer = await getTransaction(user.id, id);
    expect(transfer).toMatchObject({ type: "TRANSFER", date: "2026-10-02", amount: "285000.00", currency: "UZS", account: { id: uzcard.id } });
    expect(transfer.counterpart).toMatchObject({ accountId: visa.id, amount: "22.40", currency: "USD" });
    await consistent(user.id, uzcard.id, visa.id);
  });

  it("a negative adjustment becomes money sent to the other account", async () => {
    const { user, uzcard, visa } = await setup();
    const adjId = await adjustAccountBalance(user.id, { accountId: visa.id, targetBalance: "8", date: "2026-10-04" });
    await convertAdjustmentToTransfer(user.id, { id: adjId!, counterpartAccountId: uzcard.id, counterpartAmount: "25000" });
    expect(await balanceOf(visa.id)).toBe("8.00");
    expect(await balanceOf(uzcard.id)).toBe("5025000.00");
    await consistent(user.id, uzcard.id, visa.id);
  });

  it("refuses what it cannot convert, and another user's adjustment", async () => {
    const { user, uzcard, visa } = await setup();
    const adjId = (await adjustAccountBalance(user.id, { accountId: visa.id, targetBalance: "12", date: "2026-10-04" }))!;
    await expect(convertAdjustmentToTransfer(user.id, { id: adjId, counterpartAccountId: uzcard.id })).rejects.toThrow(/Укажите, сколько это было в UZS/);
    await expect(convertAdjustmentToTransfer(user.id, { id: adjId, counterpartAccountId: visa.id })).rejects.toBeInstanceOf(DomainError);

    const other = await createUser("Other");
    const theirs = await createTestAccount(other.id, { name: "Theirs", openingBalance: "1000" });
    await expect(convertAdjustmentToTransfer(other.id, { id: adjId, counterpartAccountId: theirs.id, counterpartAmount: "1" })).rejects.toBeInstanceOf(NotFoundError);
    // Converting into someone else's account is refused too.
    await expect(convertAdjustmentToTransfer(user.id, { id: adjId, counterpartAccountId: theirs.id, counterpartAmount: "1" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await balanceOf(theirs.id)).toBe("1000.00");

    // Nothing changed after the failures; then it works once and only once.
    expect(await balanceOf(visa.id)).toBe("12.00");
    expect(await balanceOf(uzcard.id)).toBe("5000000.00");
    await convertAdjustmentToTransfer(user.id, { id: adjId, counterpartAccountId: uzcard.id, counterpartAmount: "25000" });
    await expect(convertAdjustmentToTransfer(user.id, { id: adjId, counterpartAccountId: uzcard.id, counterpartAmount: "25000" })).rejects.toThrow(/аннулирована/);

    const { items } = await listTransactions(user.id, { page: 1, account: visa.id });
    expect(items.filter((t) => !t.isVoided).map((t) => t.type)).toEqual(["TRANSFER"]);
  });
});

describe("balance correction recorded as a conversion", () => {
  beforeEach(resetDatabase);

  it("brings the account to the target with a transfer from the other account", async () => {
    const { user, uzcard, visa } = await setup();
    const id = await adjustBalanceByTransfer(user.id, { accountId: visa.id, targetBalance: "30", date: "2026-10-04", counterpartAccountId: uzcard.id, counterpartAmount: "240000" });
    expect(id).not.toBeNull();
    expect(await balanceOf(visa.id)).toBe("30.00");
    expect(await balanceOf(uzcard.id)).toBe("4760000.00");
    expect(await adjustBalanceByTransfer(user.id, { accountId: visa.id, targetBalance: "30", date: "2026-10-04", counterpartAccountId: uzcard.id })).toBeNull();
    await consistent(user.id, uzcard.id, visa.id);
  });

  it("same currency needs no second amount; a different one does", async () => {
    const { user, uzcard, visa } = await setup();
    const cash = await createTestAccount(user.id, { name: "Наличные", type: "CASH", openingBalance: "100000" });
    await adjustBalanceByTransfer(user.id, { accountId: cash.id, targetBalance: "300000", date: "2026-10-04", counterpartAccountId: uzcard.id });
    expect(await balanceOf(cash.id)).toBe("300000.00");
    expect(await balanceOf(uzcard.id)).toBe("4800000.00");
    await expect(adjustBalanceByTransfer(user.id, { accountId: visa.id, targetBalance: "5", date: "2026-10-04", counterpartAccountId: uzcard.id })).rejects.toThrow(/в UZS/);
    expect(await balanceOf(visa.id)).toBe("10.00");
  });
});
