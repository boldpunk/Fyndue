import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { displayName, MAX_DOCUMENT_BYTES, sniffFileType } from "@/lib/documents/files";
import { dbToLocalDate } from "@/lib/finance/dates";
import { toMoneyString } from "@/lib/finance/money";
import type { Document } from "@/lib/generated/prisma/client";
import { getStorage, type StorageAdapter } from "@/lib/storage";
import type { DocumentUpdateInput, DocumentUploadInput } from "@/lib/validations/documents";
import { writeAudit } from "./audit";

/** Per-user cap; a guard against runaway uploads, far above normal use. */
export const MAX_DOCUMENTS_PER_USER = 500;

export type DocumentDTO = {
  id: string;
  type: Document["type"];
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  payment: { id: string; paymentDate: string; amount: string; isReversed: boolean } | null;
};

async function assertOwnedDebt(userId: string, debtId: string) {
  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId }, select: { id: true } });
  if (!debt) throw new NotFoundError("Debt");
}

async function assertPaymentOfDebt(userId: string, debtId: string, paymentId: string) {
  const payment = await prisma.debtPayment.findFirst({ where: { id: paymentId, userId, debtId }, select: { id: true } });
  if (!payment) throw new NotFoundError("Payment");
}

export async function listDebtDocuments(userId: string, debtId: string): Promise<DocumentDTO[]> {
  await assertOwnedDebt(userId, debtId);
  const rows = await prisma.document.findMany({
    where: { userId, debtId },
    include: { debtPayment: { select: { id: true, paymentDate: true, actualAccountDebit: true, reversedAt: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map((d) => ({
    id: d.id,
    type: d.type,
    name: d.name,
    mimeType: d.mimeType,
    size: d.size,
    createdAt: d.createdAt.toISOString(),
    payment: d.debtPayment
      ? {
          id: d.debtPayment.id,
          paymentDate: dbToLocalDate(d.debtPayment.paymentDate),
          amount: toMoneyString(d.debtPayment.actualAccountDebit),
          isReversed: d.debtPayment.reversedAt !== null,
        }
      : null,
  }));
}

export type UploadInput = DocumentUploadInput & { fileName: string; bytes: Uint8Array };

/**
 * Stores the bytes first, then the row (with its audit entry) in one
 * transaction. If the row can't be written the file is removed again, so a
 * failed upload never leaves an orphan behind.
 */
export async function uploadDocument(userId: string, input: UploadInput, storage: StorageAdapter = getStorage()): Promise<{ id: string }> {
  const { bytes } = input;
  if (bytes.byteLength === 0) throw new DomainError("The file is empty.", "VALIDATION", { file: "The file is empty." });
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new DomainError("Files can be up to 10 MB.", "VALIDATION", { file: "Files can be up to 10 MB." });
  }
  const mimeType = sniffFileType(bytes);
  if (!mimeType) {
    throw new DomainError("Only PDF, JPG and PNG files are supported.", "VALIDATION", { file: "Only PDF, JPG and PNG files are supported." });
  }

  await assertOwnedDebt(userId, input.debtId);
  if (input.debtPaymentId) await assertPaymentOfDebt(userId, input.debtId, input.debtPaymentId);
  if ((await prisma.document.count({ where: { userId } })) >= MAX_DOCUMENTS_PER_USER) {
    throw new DomainError(`You can keep up to ${MAX_DOCUMENTS_PER_USER} documents. Delete some to upload more.`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await prisma.document.findFirst({ where: { userId, debtId: input.debtId, sha256 }, select: { name: true } });
  if (duplicate) throw new DomainError(`This file is already attached as “${duplicate.name}”.`, "DUPLICATE", { file: "Already uploaded" });

  const storageKey = `users/${userId}/${randomBytes(18).toString("base64url")}`;
  await storage.put(storageKey, bytes);
  try {
    return await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          userId,
          debtId: input.debtId,
          debtPaymentId: input.debtPaymentId ?? null,
          type: input.type,
          name: input.name ? displayName(input.name) : displayName(input.fileName),
          storageKey,
          mimeType,
          size: bytes.byteLength,
          sha256,
        },
      });
      await writeAudit(tx, {
        userId,
        action: "DOCUMENT_UPLOADED",
        entityType: "Document",
        entityId: doc.id,
        metadata: { debtId: input.debtId, type: input.type, mimeType, size: bytes.byteLength, sha256 },
      });
      return { id: doc.id };
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

async function findOwned(userId: string, id: string) {
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc) throw new NotFoundError("Document");
  return doc;
}

export async function updateDocument(userId: string, input: DocumentUpdateInput): Promise<void> {
  const doc = await findOwned(userId, input.id);
  if (input.debtPaymentId) {
    if (!doc.debtId) throw new DomainError("Only debt documents can be linked to a payment.");
    await assertPaymentOfDebt(userId, doc.debtId, input.debtPaymentId);
  }
  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: doc.id },
      data: { type: input.type, name: displayName(input.name), debtPaymentId: input.debtPaymentId ?? null },
    });
    await writeAudit(tx, {
      userId,
      action: "DOCUMENT_UPDATED",
      entityType: "Document",
      entityId: doc.id,
      metadata: { type: input.type, debtPaymentId: input.debtPaymentId ?? null },
    });
  });
}

/**
 * Documents are evidence, not financial facts, so deleting one really
 * deletes it; the audit row keeps its hash. The row goes first: if removing
 * the file then fails, only an unreachable orphan is left, never a row
 * pointing at nothing.
 */
export async function deleteDocument(userId: string, id: string, storage: StorageAdapter = getStorage()): Promise<void> {
  const doc = await findOwned(userId, id);
  await prisma.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: doc.id } });
    await writeAudit(tx, {
      userId,
      action: "DOCUMENT_DELETED",
      entityType: "Document",
      entityId: doc.id,
      metadata: { debtId: doc.debtId, type: doc.type, sha256: doc.sha256 },
    });
  });
  await storage.delete(doc.storageKey).catch((error: unknown) => {
    console.error("[documents] file removal failed", error instanceof Error ? error.name : "UnknownError");
  });
}

export type DocumentFile = { name: string; mimeType: string; size: number; sha256: string; bytes: Uint8Array };

/** For the download route: the owner's document, or NotFound (never "forbidden"). */
export async function readDocument(userId: string, id: string, storage: StorageAdapter = getStorage()): Promise<DocumentFile> {
  const doc = await findOwned(userId, id);
  let bytes: Uint8Array;
  try {
    bytes = await storage.get(doc.storageKey);
  } catch {
    throw new NotFoundError("Document");
  }
  return { name: doc.name, mimeType: doc.mimeType, size: doc.size, sha256: doc.sha256, bytes };
}
