import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, type Tx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { balanceEffect } from "@/lib/finance/balance";
import { dbToLocalDate, localDateToDb, monthBounds, parseYearMonth } from "@/lib/finance/dates";
import { money, toMoneyString } from "@/lib/finance/money";
import type { Prisma, Transaction } from "@/lib/generated/prisma/client";
import type {
  CashFlowUpdateInput,
  ExpenseInput,
  IncomeInput,
  TransactionCreateInput,
  TransactionFilters,
  TransferInput,
  TransferUpdateInput,
} from "@/lib/validations/transactions";
import { applyBalanceDelta, lockOwnedAccount } from "./accounts";
import { writeAudit } from "./audit";
import { isUniqueViolation } from "./prisma-errors";

export const TRANSACTIONS_PAGE_SIZE = 30;

export type TransactionDTO = {
  id: string;
  type: Transaction["type"];
  direction: Transaction["direction"];
  status: Transaction["status"];
  amount: string;
  currency: Transaction["currency"];
  date: string;
  merchant: string | null;
  note: string | null;
  account: { id: string; name: string };
  category: { id: string; name: string; icon: string; color: string | null } | null;
  /** The other leg of a transfer. */
  counterpart: { transactionId: string; accountId: string; accountName: string; amount: string; currency: string } | null;
  isVoided: boolean;
  voidReason: string | null;
  editable: boolean;
};

const transactionInclude = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, icon: true, color: true } },
} satisfies Prisma.TransactionInclude;

type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

const EDITABLE_TYPES = new Set<Transaction["type"]>(["EXPENSE", "INCOME", "TRANSFER"]);

function toTransactionDTO(t: TransactionWithRelations, counterpart: TransactionWithRelations | undefined): TransactionDTO {
  return {
    id: t.id,
    type: t.type,
    direction: t.direction,
    status: t.status,
    amount: toMoneyString(t.amount),
    currency: t.currency,
    date: dbToLocalDate(t.transactionDate),
    merchant: t.merchant,
    note: t.note,
    account: t.account,
    category: t.category,
    counterpart: counterpart
      ? {
          transactionId: counterpart.id,
          accountId: counterpart.account.id,
          accountName: counterpart.account.name,
          amount: toMoneyString(counterpart.amount),
          currency: counterpart.currency,
        }
      : null,
    isVoided: t.voidedAt !== null,
    voidReason: t.voidReason,
    editable: t.voidedAt === null && EDITABLE_TYPES.has(t.type),
  };
}

async function attachCounterparts(userId: string, rows: TransactionWithRelations[]): Promise<TransactionDTO[]> {
  const groupIds = rows.map((r) => r.transferGroupId).filter((g): g is string => g !== null);
  const partners = groupIds.length
    ? await prisma.transaction.findMany({
        where: { userId, transferGroupId: { in: groupIds } },
        include: transactionInclude,
      })
    : [];
  return rows.map((row) =>
    toTransactionDTO(
      row,
      partners.find((p) => p.transferGroupId === row.transferGroupId && p.id !== row.id),
    ),
  );
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listTransactions(
  userId: string,
  filters: TransactionFilters,
): Promise<{ items: TransactionDTO[]; total: number; page: number; pageCount: number }> {
  const month = parseYearMonth(filters.month);
  const bounds = month ? monthBounds(month) : null;

  const where: Prisma.TransactionWhereInput = {
    userId,
    voidedAt: null,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.category ? { categoryId: filters.category } : {}),
    ...(filters.account
      ? { accountId: filters.account }
      : // Without an account filter a transfer is shown once (its outgoing leg).
        { NOT: { type: "TRANSFER", direction: "INFLOW" } }),
    ...(bounds
      ? { transactionDate: { gte: localDateToDb(bounds.start), lt: localDateToDb(bounds.endExclusive) } }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { note: { contains: filters.q, mode: "insensitive" } },
            { merchant: { contains: filters.q, mode: "insensitive" } },
            { category: { name: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      skip: (filters.page - 1) * TRANSACTIONS_PAGE_SIZE,
      take: TRANSACTIONS_PAGE_SIZE,
    }),
  ]);

  return {
    items: await attachCounterparts(userId, rows),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / TRANSACTIONS_PAGE_SIZE)),
  };
}

export async function getTransaction(userId: string, id: string): Promise<TransactionDTO> {
  const row = await prisma.transaction.findFirst({ where: { id, userId }, include: transactionInclude });
  if (!row) throw new NotFoundError("Transaction");
  const [dto] = await attachCounterparts(userId, [row]);
  return dto!;
}

export async function recentTransactions(userId: string, limit = 6): Promise<TransactionDTO[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, voidedAt: null, NOT: { type: "TRANSFER", direction: "INFLOW" } },
    include: transactionInclude,
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return attachCounterparts(userId, rows);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ownedUsableAccount(tx: Tx, userId: string, accountId: string) {
  const account = await lockOwnedAccount(tx, userId, accountId);
  if (account.isArchived) {
    throw new DomainError("This account is archived.", "ACCOUNT_ARCHIVED", { accountId: "Account is archived" });
  }
  return account;
}

async function ownedCategory(tx: Tx, userId: string, categoryId: string, type: "EXPENSE" | "INCOME") {
  const category = await tx.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) throw new NotFoundError("Category");
  if (category.type !== type) {
    throw new DomainError("Category does not match the transaction type.", "CATEGORY_TYPE", {
      categoryId: "Choose a matching category",
    });
  }
  if (category.isSystem) {
    throw new DomainError("This category is managed by Fyndue.", "SYSTEM_CATEGORY", {
      categoryId: "Choose another category",
    });
  }
  return category;
}

async function findByRequestId(userId: string, clientRequestId: string) {
  return prisma.transaction.findFirst({ where: { userId, clientRequestId }, select: { id: true } });
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * Creates an expense, income or transfer. Idempotent per `clientRequestId`:
 * a retried or double-clicked submit returns the first result.
 */
export async function createTransaction(userId: string, input: TransactionCreateInput): Promise<{ id: string }> {
  const existing = await findByRequestId(userId, input.clientRequestId);
  if (existing) return existing;
  try {
    return input.kind === "TRANSFER"
      ? await createTransfer(userId, input, input.clientRequestId)
      : await createCashFlow(userId, input, input.clientRequestId);
  } catch (error) {
    if (isUniqueViolation(error, "clientRequestId")) {
      const winner = await findByRequestId(userId, input.clientRequestId);
      if (winner) return winner;
    }
    throw error;
  }
}

async function createCashFlow(
  userId: string,
  input: ExpenseInput | IncomeInput,
  clientRequestId: string,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const account = await ownedUsableAccount(tx, userId, input.accountId);
    await ownedCategory(tx, userId, input.categoryId, input.kind);
    const direction = input.kind === "INCOME" ? "INFLOW" : "OUTFLOW";
    const status = input.kind === "INCOME" ? input.status : "ACTUAL";

    const created = await tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: input.categoryId,
        type: input.kind,
        direction,
        status,
        amount: input.amount,
        currency: account.currency,
        transactionDate: localDateToDb(input.date),
        merchant: input.merchant ?? null,
        note: input.note ?? null,
        clientRequestId,
      },
    });
    await applyBalanceDelta(tx, account.id, balanceEffect({ direction, amount: input.amount, status }));
    await writeAudit(tx, {
      userId,
      action: "TRANSACTION_CREATED",
      entityType: "Transaction",
      entityId: created.id,
      metadata: { type: input.kind, status, amount: input.amount, accountId: account.id },
    });
    return { id: created.id };
  });
}

async function createTransfer(userId: string, input: TransferInput, clientRequestId: string): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    // Lock in a stable order so two opposite transfers can't deadlock.
    const [firstId, secondId] = [input.fromAccountId, input.toAccountId].sort();
    const first = await ownedUsableAccount(tx, userId, firstId!);
    const second = await ownedUsableAccount(tx, userId, secondId!);
    const from = first.id === input.fromAccountId ? first : second;
    const to = first.id === input.fromAccountId ? second : first;

    const toAmount = resolveTransferToAmount(from.currency, to.currency, input.amount, input.toAmount);
    const transferGroupId = randomUUID();
    const date = localDateToDb(input.date);

    const outLeg = await tx.transaction.create({
      data: {
        userId,
        accountId: from.id,
        type: "TRANSFER",
        direction: "OUTFLOW",
        amount: input.amount,
        currency: from.currency,
        transactionDate: date,
        note: input.note ?? null,
        transferGroupId,
        clientRequestId,
      },
    });
    await tx.transaction.create({
      data: {
        userId,
        accountId: to.id,
        type: "TRANSFER",
        direction: "INFLOW",
        amount: toAmount,
        currency: to.currency,
        transactionDate: date,
        note: input.note ?? null,
        transferGroupId,
      },
    });
    await applyBalanceDelta(tx, from.id, money(input.amount).negated());
    await applyBalanceDelta(tx, to.id, money(toAmount));
    await writeAudit(tx, {
      userId,
      action: "TRANSFER_CREATED",
      entityType: "Transaction",
      entityId: outLeg.id,
      metadata: { transferGroupId, fromAccountId: from.id, toAccountId: to.id, amount: input.amount, toAmount },
    });
    return { id: outLeg.id };
  });
}

/**
 * Same-currency transfers move the same amount. Cross-currency transfers need
 * the credited amount explicitly — Fyndue never invents an exchange rate.
 */
function resolveTransferToAmount(
  fromCurrency: string,
  toCurrency: string,
  amount: string,
  toAmount: string | undefined,
): string {
  if (fromCurrency === toCurrency) {
    if (toAmount !== undefined && !money(toAmount).equals(money(amount))) {
      throw new DomainError("Transfers in the same currency move the same amount.", "TRANSFER_AMOUNT", {
        toAmount: "Must equal the amount sent",
      });
    }
    return amount;
  }
  if (toAmount === undefined) {
    throw new DomainError(`Enter the amount received in ${toCurrency}.`, "TRANSFER_CONVERSION", {
      toAmount: `Amount received in ${toCurrency} is required`,
    });
  }
  return toAmount;
}

async function lockOwnedTransaction(tx: Tx, userId: string, id: string): Promise<Transaction> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Transaction" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("Transaction");
  return tx.transaction.findFirstOrThrow({ where: { id, userId } });
}

function assertEditable(t: Transaction, expected: "cash-flow" | "transfer") {
  if (t.voidedAt) throw new DomainError("Voided transactions can't be edited.", "VOIDED");
  const isTransfer = t.type === "TRANSFER";
  if (expected === "transfer" ? !isTransfer : t.type !== "EXPENSE" && t.type !== "INCOME") {
    throw new DomainError("This transaction can't be edited here.", "NOT_EDITABLE");
  }
}

/** Edits an expense or income, moving balances between accounts if needed. */
export async function updateCashFlowTransaction(userId: string, input: CashFlowUpdateInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await lockOwnedTransaction(tx, userId, input.id);
    assertEditable(before, "cash-flow");
    const type = before.type as "EXPENSE" | "INCOME";
    const status = type === "INCOME" ? (input.status ?? before.status) : "ACTUAL";

    const oldAccount = await lockOwnedAccount(tx, userId, before.accountId);
    const newAccount =
      input.accountId === before.accountId ? oldAccount : await ownedUsableAccount(tx, userId, input.accountId);
    await ownedCategory(tx, userId, input.categoryId, type);

    await applyBalanceDelta(tx, oldAccount.id, balanceEffect({ direction: before.direction, amount: before.amount, status: before.status }).negated());
    await applyBalanceDelta(tx, newAccount.id, balanceEffect({ direction: before.direction, amount: input.amount, status }));

    await tx.transaction.update({
      where: { id: before.id },
      data: {
        accountId: newAccount.id,
        currency: newAccount.currency,
        categoryId: input.categoryId,
        amount: input.amount,
        status,
        transactionDate: localDateToDb(input.date),
        merchant: input.merchant ?? null,
        note: input.note ?? null,
      },
    });
    await writeAudit(tx, {
      userId,
      action: "TRANSACTION_UPDATED",
      entityType: "Transaction",
      entityId: before.id,
      metadata: {
        before: { amount: toMoneyString(before.amount), accountId: before.accountId, date: dbToLocalDate(before.transactionDate), status: before.status },
        after: { amount: input.amount, accountId: newAccount.id, date: input.date, status },
      },
    });
  });
}

export async function updateTransfer(userId: string, input: TransferUpdateInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await lockOwnedTransaction(tx, userId, input.id);
    assertEditable(target, "transfer");
    const legs = await tx.transaction.findMany({ where: { userId, transferGroupId: target.transferGroupId } });
    const outLeg = legs.find((l) => l.direction === "OUTFLOW");
    const inLeg = legs.find((l) => l.direction === "INFLOW");
    if (!outLeg || !inLeg) throw new DomainError("This transfer is incomplete.", "BROKEN_TRANSFER");

    const toAmount = resolveTransferToAmount(outLeg.currency, inLeg.currency, input.amount, input.toAmount);
    const data = { transactionDate: localDateToDb(input.date), note: input.note ?? null };
    await tx.transaction.update({ where: { id: outLeg.id }, data: { ...data, amount: input.amount } });
    await tx.transaction.update({ where: { id: inLeg.id }, data: { ...data, amount: toAmount } });

    await applyBalanceDelta(tx, outLeg.accountId, money(outLeg.amount).minus(money(input.amount)));
    await applyBalanceDelta(tx, inLeg.accountId, money(toAmount).minus(money(inLeg.amount)));
    await writeAudit(tx, {
      userId,
      action: "TRANSACTION_UPDATED",
      entityType: "Transaction",
      entityId: outLeg.id,
      metadata: {
        before: { amount: toMoneyString(outLeg.amount), toAmount: toMoneyString(inLeg.amount) },
        after: { amount: input.amount, toAmount },
      },
    });
  });
}

/**
 * Voids instead of deleting: the row stays for history, its balance effect
 * is reversed. Voiding one leg of a transfer voids both.
 */
export async function voidTransaction(userId: string, id: string, reason?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await lockOwnedTransaction(tx, userId, id);
    if (target.voidedAt) throw new DomainError("This transaction is already voided.", "VOIDED");
    if (target.type === "DEBT_PAYMENT" || target.type === "LOAN_DISBURSEMENT") {
      throw new DomainError("Debt transactions are reversed from the debt's payment history.", "USE_DEBT_REVERSAL");
    }

    const legs = target.transferGroupId
      ? await tx.transaction.findMany({ where: { userId, transferGroupId: target.transferGroupId } })
      : [target];
    const voidedAt = new Date();
    for (const leg of legs) {
      await tx.transaction.update({ where: { id: leg.id }, data: { voidedAt, voidReason: reason ?? null } });
      await applyBalanceDelta(tx, leg.accountId, balanceEffect({ direction: leg.direction, amount: leg.amount, status: leg.status }).negated());
    }
    await writeAudit(tx, {
      userId,
      action: "TRANSACTION_VOIDED",
      entityType: "Transaction",
      entityId: target.id,
      metadata: { type: target.type, legs: legs.map((l) => l.id), hasReason: Boolean(reason) },
    });
  });
}

/** Expected income becomes actual and starts counting in the balance. */
export async function confirmExpectedIncome(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await lockOwnedTransaction(tx, userId, id);
    if (target.voidedAt || target.type !== "INCOME" || target.status !== "EXPECTED") {
      throw new DomainError("Only expected income can be confirmed.", "NOT_EXPECTED");
    }
    await lockOwnedAccount(tx, userId, target.accountId);
    await tx.transaction.update({ where: { id: target.id }, data: { status: "ACTUAL" } });
    await applyBalanceDelta(tx, target.accountId, money(target.amount));
    await writeAudit(tx, {
      userId,
      action: "TRANSACTION_CONFIRMED",
      entityType: "Transaction",
      entityId: target.id,
    });
  });
}
