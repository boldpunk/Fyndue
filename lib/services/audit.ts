import "server-only";
import type { Tx } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export type AuditAction =
  | "ACCOUNT_CREATED"
  | "ACCOUNT_UPDATED"
  | "ACCOUNT_ARCHIVED"
  | "ACCOUNT_UNARCHIVED"
  | "ACCOUNT_ADJUSTED"
  | "CATEGORY_CREATED"
  | "CATEGORY_UPDATED"
  | "CATEGORY_ARCHIVED"
  | "CATEGORY_UNARCHIVED"
  | "CATEGORIES_REORDERED"
  | "TRANSACTION_CREATED"
  | "TRANSACTION_UPDATED"
  | "TRANSACTION_VOIDED"
  | "TRANSACTION_CONFIRMED"
  | "TRANSFER_CREATED"
  | "PROFILE_UPDATED";

export type AuditEntry = {
  userId: string;
  action: AuditAction;
  entityType: "Account" | "Category" | "Transaction" | "User";
  entityId: string;
  /** Changed-field snapshots only. Never secrets, tokens or free-text notes. */
  metadata?: Prisma.InputJsonValue;
};

/** Must be called with the transaction client of the change being audited. */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({ data: entry });
}
