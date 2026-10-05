import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { adjustmentFor, computeBalance } from "@/lib/finance/balance";
import { dbToLocalDate, formatLocalDate, localDateToDb, type LocalDate } from "@/lib/finance/dates";
import { money, toMoneyString, type FinDecimal } from "@/lib/finance/money";
import type { Account } from "@/lib/generated/prisma/client";
import type {
  AccountCreateInput,
  AccountUpdateInput,
  BalanceAdjustmentInput,
} from "@/lib/validations/accounts";
import { assertWithinLimit } from "./billing";
import { writeAudit } from "./audit";

export type AccountDTO = {
  id: string;
  name: string;
  type: Account["type"];
  currency: Account["currency"];
  openingBalance: string;
  currentBalance: string;
  includeInTotal: boolean;
  bank: string | null;
  color: string | null;
  isArchived: boolean;
  /** First day tracked; earlier money is in the opening balance. */
  trackingStartDate: string | null;
};

export function toAccountDTO(account: Account): AccountDTO {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    openingBalance: toMoneyString(account.openingBalance),
    currentBalance: toMoneyString(account.currentBalance),
    includeInTotal: account.includeInTotal,
    bank: account.bank,
    color: account.color,
    isArchived: account.isArchived,
    trackingStartDate: account.trackingStartDate ? dbToLocalDate(account.trackingStartDate) : null,
  };
}

/**
 * Money before an account's tracking start is already in its opening
 * balance; an operation dated earlier would count it twice.
 */
export function assertTrackedDate(account: Pick<Account, "name" | "trackingStartDate">, date: LocalDate): void {
  if (!account.trackingStartDate) return;
  const start = dbToLocalDate(account.trackingStartDate);
  if (date < start) {
    const day = formatLocalDate(start, undefined, { day: "numeric", month: "long" });
    throw new DomainError(
      `Учёт по счёту «${account.name}» начат ${day}: всё, что было раньше, уже входит в начальный баланс. Укажите дату не раньше ${day}.`,
      "BEFORE_TRACKING_START",
      { date: `Не раньше ${day}` },
    );
  }
}

export async function listAccounts(userId: string, options: { includeArchived?: boolean } = {}): Promise<AccountDTO[]> {
  const accounts = await prisma.account.findMany({
    where: { userId, ...(options.includeArchived ? {} : { isArchived: false }) },
    orderBy: [{ isArchived: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return accounts.map(toAccountDTO);
}

export async function getAccount(userId: string, id: string): Promise<AccountDTO> {
  const account = await prisma.account.findFirst({ where: { id, userId } });
  if (!account) throw new NotFoundError("Account");
  return toAccountDTO(account);
}

/**
 * Loads an account owned by `userId` and locks its row for the rest of the
 * DB transaction. Accounts of other users are reported as not found.
 */
export async function lockOwnedAccount(tx: Tx, userId: string, id: string): Promise<Account> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Account" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
  if (locked.length === 0) throw new NotFoundError("Account");
  return tx.account.findFirstOrThrow({ where: { id, userId } });
}

/** Atomic balance change (`SET currentBalance = currentBalance + delta`). */
export async function applyBalanceDelta(tx: Tx, accountId: string, delta: FinDecimal): Promise<void> {
  if (delta.isZero()) return;
  await tx.account.update({
    where: { id: accountId },
    data: { currentBalance: { increment: delta.toFixed(2) } },
  });
}

export async function createAccount(userId: string, input: AccountCreateInput): Promise<AccountDTO> {
  return prisma.$transaction(async (tx) => {
    await assertWithinLimit(userId, "accounts", tx);
    const last = await tx.account.aggregate({ where: { userId }, _max: { sortOrder: true } });
    const account = await tx.account.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        currency: input.currency,
        openingBalance: input.openingBalance,
        currentBalance: input.openingBalance,
        includeInTotal: input.includeInTotal,
        bank: input.bank ?? null,
        color: input.color ?? null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    await writeAudit(tx, {
      userId,
      action: "ACCOUNT_CREATED",
      entityType: "Account",
      entityId: account.id,
      metadata: { type: account.type, currency: account.currency, openingBalance: input.openingBalance },
    });
    return toAccountDTO(account);
  });
}

export async function updateAccount(userId: string, input: AccountUpdateInput): Promise<AccountDTO> {
  return prisma.$transaction(async (tx) => {
    const before = await lockOwnedAccount(tx, userId, input.id);
    // Changing the opening balance shifts the current balance by the same delta.
    const openingDelta = money(input.openingBalance).minus(money(before.openingBalance));
    const account = await tx.account.update({
      where: { id: before.id },
      data: {
        name: input.name,
        type: input.type,
        includeInTotal: input.includeInTotal,
        bank: input.bank ?? null,
        color: input.color ?? null,
        openingBalance: input.openingBalance,
        currentBalance: { increment: openingDelta.toFixed(2) },
      },
    });
    await writeAudit(tx, {
      userId,
      action: "ACCOUNT_UPDATED",
      entityType: "Account",
      entityId: account.id,
      metadata: {
        before: { name: before.name, type: before.type, openingBalance: toMoneyString(before.openingBalance) },
        after: { name: account.name, type: account.type, openingBalance: input.openingBalance },
      },
    });
    return toAccountDTO(account);
  });
}

export async function setAccountArchived(userId: string, id: string, archived: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.account.updateMany({ where: { id, userId }, data: { isArchived: archived } });
    if (result.count !== 1) throw new NotFoundError("Account");
    await writeAudit(tx, {
      userId,
      action: archived ? "ACCOUNT_ARCHIVED" : "ACCOUNT_UNARCHIVED",
      entityType: "Account",
      entityId: id,
    });
  });
}

/**
 * Reconciliation: records an explicit BALANCE_ADJUSTMENT so the account shows
 * `targetBalance` (SPEC §30). Returns null when no change was needed.
 */
export async function adjustAccountBalance(userId: string, input: BalanceAdjustmentInput): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const account = await lockOwnedAccount(tx, userId, input.accountId);
    assertTrackedDate(account, input.date as LocalDate);
    const adjustment = adjustmentFor(account.currentBalance, input.targetBalance);
    if (!adjustment) return null;
    const transaction = await tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        type: "BALANCE_ADJUSTMENT",
        direction: adjustment.direction,
        amount: adjustment.amount.toFixed(2),
        currency: account.currency,
        transactionDate: localDateToDb(input.date as LocalDate),
        note: input.note ?? "Корректировка баланса",
        source: "MANUAL",
      },
    });
    await applyBalanceDelta(
      tx,
      account.id,
      adjustment.direction === "INFLOW" ? adjustment.amount : adjustment.amount.negated(),
    );
    await writeAudit(tx, {
      userId,
      action: "ACCOUNT_ADJUSTED",
      entityType: "Account",
      entityId: account.id,
      metadata: {
        transactionId: transaction.id,
        from: toMoneyString(account.currentBalance),
        to: input.targetBalance,
      },
    });
    return transaction.id;
  });
}

/**
 * Recomputes the balance from source transactions. Used by integrity tests
 * (and later a scheduled check) to prove the denormalised value is right.
 */
export async function recomputeAccountBalance(userId: string, accountId: string): Promise<string> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new NotFoundError("Account");
  const flows = await prisma.transaction.groupBy({
    by: ["direction"],
    where: { userId, accountId, voidedAt: null, status: "ACTUAL" },
    _sum: { amount: true },
  });
  return toMoneyString(
    computeBalance(
      account.openingBalance,
      flows.map((f) => ({ direction: f.direction, amount: f._sum.amount ?? "0" })),
    ),
  );
}
