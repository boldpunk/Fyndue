import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { recordDebtPayment } from "@/lib/services/debt-payments";
import { getDebtDetail } from "@/lib/services/debts";
import { deleteDocument, listDebtDocuments, readDocument, updateDocument, uploadDocument } from "@/lib/services/documents";
import { localDiskStorage, type StorageAdapter } from "@/lib/storage";
import { createTestAccount, createUser, resetDatabase } from "../support/factories";
import { createTestDebt, zeroBreakdown } from "../support/debt-factories";

const pdf = (body = "loan") => new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF`);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const storageRoot = process.env.STORAGE_DIR!;

async function setup() {
  const user = await createUser();
  const { id: debtId } = await createTestDebt(user.id);
  return { user, debtId };
}

describe("documents (SPEC §41)", () => {
  beforeEach(resetDatabase);

  it("uploads, lists and reads back a private document", async () => {
    const { user, debtId } = await setup();
    const { id } = await uploadDocument(user.id, { debtId, type: "LOAN_AGREEMENT", fileName: "C:\\scans\\Agreement 2026.pdf", bytes: pdf() });

    const [doc] = await listDebtDocuments(user.id, debtId);
    expect(doc).toMatchObject({ id, type: "LOAN_AGREEMENT", name: "Agreement 2026", mimeType: "application/pdf", size: pdf().byteLength, payment: null });

    const file = await readDocument(user.id, id);
    expect(new TextDecoder().decode(file.bytes)).toContain("%PDF-1.7");
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Stored under a random key in the user's folder; the file name never reaches the disk.
    const row = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(row.storageKey).toMatch(new RegExp(`^users/${user.id}/[A-Za-z0-9_-]{24}$`));
    expect(existsSync(path.join(storageRoot, row.storageKey))).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "DOCUMENT_UPLOADED" } })).toBe(1);
  });

  it("decides the type from the bytes and rejects anything else", async () => {
    const { user, debtId } = await setup();
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    await expect(uploadDocument(user.id, { debtId, type: "OTHER", fileName: "receipt.pdf", bytes: html })).rejects.toThrow(/только PDF, JPG и PNG/);
    await expect(uploadDocument(user.id, { debtId, type: "OTHER", fileName: "empty.pdf", bytes: new Uint8Array() })).rejects.toThrow(/пустой/);
    const huge = new Uint8Array(10 * 1024 * 1024 + 1);
    huge.set(pdf());
    await expect(uploadDocument(user.id, { debtId, type: "OTHER", fileName: "big.pdf", bytes: huge })).rejects.toThrow(/10 МБ/);

    // A PNG called ".pdf" is stored as what it really is.
    const { id } = await uploadDocument(user.id, { debtId, type: "BANK_SCHEDULE", fileName: "schedule.pdf", bytes: png() });
    expect((await readDocument(user.id, id)).mimeType).toBe("image/png");
    expect(await prisma.document.count()).toBe(1);
  });

  it("refuses the same file twice on one debt", async () => {
    const { user, debtId } = await setup();
    await uploadDocument(user.id, { debtId, type: "OTHER", fileName: "a.pdf", bytes: pdf() });
    await expect(uploadDocument(user.id, { debtId, type: "OTHER", fileName: "b.pdf", bytes: pdf() })).rejects.toThrow(/уже загружен как «a»/);
  });

  it("links a receipt to a payment of the same debt and keeps it after a reversal", async () => {
    const { user, debtId } = await setup();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const debt = await getDebtDetail(user.id, debtId);
    const { id: paymentId } = await recordDebtPayment(user.id, {
      clientRequestId: randomUUID(),
      debtId,
      accountId: card.id,
      paymentDate: "2026-02-01",
      scheduleItemId: debt.schedule[0]!.id,
      settlesItem: false,
      note: undefined,
      ...zeroBreakdown,
      principal: "1000",
      interest: "120",
    });
    const { id } = await uploadDocument(user.id, { debtId, debtPaymentId: paymentId, type: "PAYMENT_RECEIPT", fileName: "check.png", bytes: png() });
    expect((await listDebtDocuments(user.id, debtId))[0]!.payment).toMatchObject({ id: paymentId, paymentDate: "2026-02-01", amount: "1120.00", isReversed: false });

    // A payment of another debt cannot be linked.
    const { id: otherDebt } = await createTestDebt(user.id, { name: "Other" });
    await expect(
      uploadDocument(user.id, { debtId: otherDebt, debtPaymentId: paymentId, type: "PAYMENT_RECEIPT", fileName: "x.pdf", bytes: pdf("x") }),
    ).rejects.toThrow(/Платёж не найден/);

    await updateDocument(user.id, { id, type: "OTHER", name: "Bank receipt", debtPaymentId: undefined });
    expect((await listDebtDocuments(user.id, debtId))[0]).toMatchObject({ name: "Bank receipt", type: "OTHER", payment: null });
  });

  it("deleting removes the row and the file, and keeps an audit entry", async () => {
    const { user, debtId } = await setup();
    const { id } = await uploadDocument(user.id, { debtId, type: "OTHER", fileName: "a.pdf", bytes: pdf() });
    const { storageKey } = await prisma.document.findUniqueOrThrow({ where: { id } });
    await deleteDocument(user.id, id);
    expect(await prisma.document.count()).toBe(0);
    expect(existsSync(path.join(storageRoot, storageKey))).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "DOCUMENT_DELETED" } })).toBe(1);
  });

  it("a storage failure leaves no row behind", async () => {
    const { user, debtId } = await setup();
    const broken: StorageAdapter = { ...localDiskStorage(storageRoot), put: async () => Promise.reject(new Error("disk full")) };
    await expect(uploadDocument(user.id, { debtId, type: "OTHER", fileName: "a.pdf", bytes: pdf() }, broken)).rejects.toThrow("disk full");
    expect(await prisma.document.count()).toBe(0);
  });

  it("storage keys cannot escape the storage folder", async () => {
    const storage = localDiskStorage(storageRoot);
    await expect(storage.get("users/../../etc/passwd")).rejects.toThrow(/Invalid storage key/);
    await expect(storage.put("users/a/short", pdf())).rejects.toThrow(/Invalid storage key/);
  });
});

describe("documents authorization (SPEC §59)", () => {
  beforeEach(resetDatabase);

  it("user A cannot access user B's documents", async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await uploadDocument(b.user.id, { debtId: b.debtId, type: "LOAN_AGREEMENT", fileName: "b.pdf", bytes: pdf() });

    await expect(readDocument(a.user.id, id)).rejects.toThrow(/Документ не найден/);
    await expect(listDebtDocuments(a.user.id, b.debtId)).rejects.toThrow(/Долг не найден/);
    await expect(updateDocument(a.user.id, { id, type: "OTHER", name: "mine", debtPaymentId: undefined })).rejects.toThrow(/Документ не найден/);
    await expect(deleteDocument(a.user.id, id)).rejects.toThrow(/Документ не найден/);
    await expect(uploadDocument(a.user.id, { debtId: b.debtId, type: "OTHER", fileName: "x.pdf", bytes: pdf("x") })).rejects.toThrow(/Долг не найден/);

    expect(await prisma.document.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: "b", type: "LOAN_AGREEMENT" });
    expect((await readDocument(b.user.id, id)).name).toBe("b");
  });
});
