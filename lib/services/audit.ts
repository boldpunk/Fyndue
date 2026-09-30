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
  | "PROFILE_UPDATED"
  | "DEBT_CREATED"
  | "DEBT_UPDATED"
  | "DEBT_ARCHIVED"
  | "DEBT_UNARCHIVED"
  | "SCHEDULE_REGENERATED"
  | "PAYMENT_RECORDED"
  | "EARLY_REPAYMENT"
  | "PAYMENT_REVERSED"
  | "RECURRING_CREATED"
  | "RECURRING_UPDATED"
  | "RECURRING_PAUSED"
  | "RECURRING_RESUMED"
  | "RECURRING_DELETED"
  | "BUDGET_SET"
  | "BUDGET_DELETED"
  | "BUDGETS_COPIED"
  | "EXCHANGE_RATE_ADDED"
  | "EXCHANGE_RATE_DELETED"
  | "TELEGRAM_CONNECTED"
  | "TELEGRAM_DISCONNECTED"
  | "NOTIFICATION_PREFERENCES_UPDATED";

export type AuditEntry = {
  userId: string;
  action: AuditAction;
  entityType: "Account" | "Category" | "Transaction" | "User" | "Debt" | "DebtPayment" | "RecurringTransaction" | "Budget" | "ExchangeRate" | "TelegramConnection" | "NotificationPreference";
  entityId: string;
  /** Changed-field snapshots only. Never secrets, tokens or free-text notes. */
  metadata?: Prisma.InputJsonValue;
};

/** Must be called with the transaction client of the change being audited. */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({ data: entry });
}
