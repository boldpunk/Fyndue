import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { deleteDocument, listDebtDocuments, listTransactionReceipts, MAX_RECEIPTS_PER_TRANSACTION, readDocument, uploadTransactionReceipt } from "@/lib/services/documents";
import { createTransaction } from "@/lib/services/transactions";
import { createTestDebt } from "../support/debt-factories";
import { categoryId, createTestAccount, createUser, requestId, resetDatabase } from "../support/factories";

const png = (n = 1) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, 2, 3]);

async function expense(userId: string) {
  const card = await createTestAccount(userId);
  return createTransaction(userId, { kind: "EXPENSE", accountId: card.id, categoryId: await categoryId(userId, "Продукты"), amount: "120000.00", date: "2026-10-05", clientRequestId: requestId() });
}

describe("receipts on operations", () => {
  beforeEach(resetDatabase);

  it("attaches, lists, reads and deletes a receipt photo", async () => {
    const user = await createUser();
    const t = await expense(user.id);
    const { id } = await uploadTransactionReceipt(user.id, { transactionId: t.id, fileName: "IMG_0042.png", bytes: png() });
    expect(await listTransactionReceipts(user.id, t.id)).toMatchObject([{ id, name: "IMG_0042", mimeType: "image/png" }]);
    expect((await readDocument(user.id, id)).mimeType).toBe("image/png");
    // Receipts don't show up among a debt's documents.
    const { id: debtId } = await createTestDebt(user.id);
    expect(await listDebtDocuments(user.id, debtId)).toEqual([]);

    await expect(uploadTransactionReceipt(user.id, { transactionId: t.id, fileName: "again.png", bytes: png() })).rejects.toThrow("уже загружен");
    await deleteDocument(user.id, id);
    expect(await listTransactionReceipts(user.id, t.id)).toEqual([]);
  });

  it("only the operation's owner, only images/PDF, at most a few per operation", async () => {
    const user = await createUser();
    const other = await createUser();
    const t = await expense(user.id);
    await expect(uploadTransactionReceipt(other.id, { transactionId: t.id, fileName: "x.png", bytes: png() })).rejects.toThrow(DomainError);
    await expect(listTransactionReceipts(other.id, t.id)).rejects.toThrow(DomainError);
    await expect(uploadTransactionReceipt(user.id, { transactionId: t.id, fileName: "x.html", bytes: new TextEncoder().encode("<html>") })).rejects.toThrow("PDF, JPG и PNG");
    for (let i = 0; i < MAX_RECEIPTS_PER_TRANSACTION; i++) await uploadTransactionReceipt(user.id, { transactionId: t.id, fileName: `${i}.png`, bytes: png(i + 10) });
    await expect(uploadTransactionReceipt(user.id, { transactionId: t.id, fileName: "more.png", bytes: png(99) })).rejects.toThrow("до 5");
  });
});
