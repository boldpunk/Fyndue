import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/errors";
import {
  adjustAccountBalance,
  getAccount,
  listAccounts,
  setAccountArchived,
  updateAccount,
} from "@/lib/services/accounts";
import { listCategories, reorderCategories, setCategoryArchived, updateCategory } from "@/lib/services/categories";
import {
  createTransaction,
  getTransaction,
  listTransactions,
  updateCashFlowTransaction,
  voidTransaction,
} from "@/lib/services/transactions";
import { balanceOf, categoryId, createTestAccount, createUser, requestId, resetDatabase } from "../support/factories";

/** SPEC §59 authorization tests: resource ids can never bypass ownership. */
describe("user data isolation", () => {
  beforeEach(resetDatabase);

  async function twoUsers() {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const bobCard = await createTestAccount(bob.id, { name: "Bob card", openingBalance: "1000" });
    const bobFuel = await categoryId(bob.id, "Топливо");
    const bobTx = await createTransaction(bob.id, { kind: "EXPENSE", accountId: bobCard.id, categoryId: bobFuel, amount: "100", date: "2026-09-10", clientRequestId: requestId() });
    const aliceCard = await createTestAccount(alice.id, { name: "Alice card", openingBalance: "1000" });
    const aliceFuel = await categoryId(alice.id, "Топливо");
    return { alice, bob, bobCard, bobFuel, bobTx, aliceCard, aliceFuel };
  }

  it("A cannot read B's accounts or transactions", async () => {
    const { alice, bobCard, bobTx } = await twoUsers();
    await expect(getAccount(alice.id, bobCard.id)).rejects.toThrow(NotFoundError);
    await expect(getTransaction(alice.id, bobTx.id)).rejects.toThrow(NotFoundError);
    expect((await listAccounts(alice.id)).map((a) => a.name)).toEqual(["Alice card"]);
    expect((await listTransactions(alice.id, { page: 1, account: bobCard.id })).total).toBe(0);
  });

  it("A cannot update, archive or adjust B's account", async () => {
    const { alice, bobCard } = await twoUsers();
    await expect(updateAccount(alice.id, { id: bobCard.id, name: "pwned", type: "CASH", includeInTotal: true, openingBalance: "0" })).rejects.toThrow(NotFoundError);
    await expect(setAccountArchived(alice.id, bobCard.id, true)).rejects.toThrow(NotFoundError);
    await expect(adjustAccountBalance(alice.id, { accountId: bobCard.id, targetBalance: "0", date: "2026-09-10" })).rejects.toThrow(NotFoundError);
    expect(await balanceOf(bobCard.id)).toBe("900.00");
  });

  it("A cannot post to B's account or use B's category", async () => {
    const { alice, bobCard, bobFuel, aliceCard, aliceFuel } = await twoUsers();
    await expect(createTransaction(alice.id, { kind: "EXPENSE", accountId: bobCard.id, categoryId: aliceFuel, amount: "1", date: "2026-09-10", clientRequestId: requestId() })).rejects.toThrow(NotFoundError);
    await expect(createTransaction(alice.id, { kind: "EXPENSE", accountId: aliceCard.id, categoryId: bobFuel, amount: "1", date: "2026-09-10", clientRequestId: requestId() })).rejects.toThrow(NotFoundError);
    await expect(createTransaction(alice.id, { kind: "TRANSFER", fromAccountId: aliceCard.id, toAccountId: bobCard.id, amount: "1", date: "2026-09-10", clientRequestId: requestId() })).rejects.toThrow(NotFoundError);
    expect(await balanceOf(aliceCard.id)).toBe("1000.00");
    expect(await balanceOf(bobCard.id)).toBe("900.00");
  });

  it("A cannot edit or void B's transaction", async () => {
    const { alice, bobTx, aliceCard, aliceFuel, bobCard } = await twoUsers();
    await expect(voidTransaction(alice.id, bobTx.id)).rejects.toThrow(NotFoundError);
    await expect(updateCashFlowTransaction(alice.id, { id: bobTx.id, accountId: aliceCard.id, categoryId: aliceFuel, amount: "1", date: "2026-09-10" })).rejects.toThrow(NotFoundError);
    expect(await balanceOf(bobCard.id)).toBe("900.00");
  });

  it("A cannot modify B's categories", async () => {
    const { alice, bob, bobFuel } = await twoUsers();
    await expect(updateCategory(alice.id, { id: bobFuel, name: "x", icon: "fuel" })).rejects.toThrow(NotFoundError);
    await expect(setCategoryArchived(alice.id, bobFuel, true)).rejects.toThrow(NotFoundError);
    await expect(reorderCategories(alice.id, { type: "EXPENSE", orderedIds: [bobFuel] })).rejects.toThrow(NotFoundError);
    const bobCategories = await listCategories(bob.id, { type: "EXPENSE" });
    expect(bobCategories.find((c) => c.id === bobFuel)?.name).toBe("Топливо");
  });
});
