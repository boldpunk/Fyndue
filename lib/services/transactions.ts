import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, type Tx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { balanceEffect } from "@/lib/finance/balance";
import { dbToLocalDate, localDateToDb, monthBounds, parseYearMonth, type LocalDate } from "@/lib/finance/dates";
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
import { applyBalanceDelta, assertTrackedDate, lockOwnedAccount } from "./accounts";
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
  debt: { id: string; name: string } | null;
  /** The other leg of a transfer. */
  counterpart: { transactionId: string; accountId: string; accountName: string; amount: string; currency: string } | null;
  isVoided: boolean;
  voidReason: string | null;
  editable: boolean;
};

const transactionInclude = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, icon: true, color: true } },
  debt: { select: { id: true, name: true } },
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
    debt: t.debt,
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
    throw new DomainError("Этот счёт в архиве.", "ACCOUNT_ARCHIVED", { accountId: "Счёт в архиве" });
  }
  return account;
}

async function ownedCategory(tx: Tx, userId: string, categoryId: string, type: "EXPENSE" | "INCOME") {
  const category = await tx.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) throw new NotFoundError("Category");
  if (category.type !== type) {
    throw new DomainError("Категория не подходит к типу операции.", "CATEGORY_TYPE", {
      categoryId: "Выберите подходящую категорию",
    });
  }
  if (category.isSystem) {
    throw new DomainError("Этой категорией управляет приложение.", "SYSTEM_CATEGORY", {
      categoryId: "Выберите другую категорию",
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
/** Links a transaction to the recurring occurrence it records. */
export type RecurringLink = { recurringId: string; occurrenceDate: LocalDate };

export async function createTransaction(
  userId: string,
  input: TransactionCreateInput,
  recurring?: RecurringLink,
): Promise<{ id: string }> {
  const existing = await findByRequestId(userId, input.clientRequestId);
  if (existing) return existing;
  try {
    return input.kind === "TRANSFER"
      ? await createTransfer(userId, input, input.clientRequestId)
      : await createCashFlow(userId, input, input.clientRequestId, recurring);
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
  recurring?: RecurringLink,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const account = await ownedUsableAccount(tx, userId, input.accountId);
    assertTrackedDate(account, input.date);
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
        recurringId: recurring?.recurringId ?? null,
        occurrenceDate: recurring ? localDateToDb(recurring.occurrenceDate) : null,
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
  return prisma.$transaction((tx) => insertTransfer(tx, userId, input, clientRequestId));
}

type TransferLegsInput = { fromAccountId: string; toAccountId: string; amount: string; toAmount?: string; date: LocalDate; note?: string };

/** Writes both legs of a transfer and moves both balances. Runs inside the caller's DB transaction. */
async function insertTransfer(tx: Tx, userId: string, input: TransferLegsInput, clientRequestId: string | null): Promise<{ id: string }> {
  // Lock in a stable order so two opposite transfers can't deadlock.
  const [firstId, secondId] = [input.fromAccountId, input.toAccountId].sort();
  const first = await ownedUsableAccount(tx, userId, firstId!);
  const second = await ownedUsableAccount(tx, userId, secondId!);
  const from = first.id === input.fromAccountId ? first : second;
  const to = first.id === input.fromAccountId ? second : first;
  assertTrackedDate(from, input.date);
  assertTrackedDate(to, input.date);

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
}

/** Types a restart may void: plain money in/out and corrections. Transfers and debt operations stay (they touch other records). */
const RESTART_VOIDABLE = ["EXPENSE", "INCOME", "BALANCE_ADJUSTMENT"] as const;

/**
 * Starts an account's tracking afresh (reconciliation): voids its balance
 * adjustments and the plain income/expenses dated before `startDate`, then
 * sets the opening balance so that the current balance equals
 * `actualBalance` — without writing a new adjustment. Later operations
 * dated before `startDate` are refused. Real operations on or after the
 * start, transfers and debt payments are kept.
 */
export async function restartAccountTracking(
  userId: string,
  input: { accountId: string; actualBalance: string; startDate: LocalDate; removeAdjustments: boolean },
): Promise<{ voided: number; openingBalance: string }> {
  return prisma.$transaction(async (tx) => {
    const account = await lockOwnedAccount(tx, userId, input.accountId);
    if (account.isArchived) throw new DomainError("Этот счёт в архиве.", "ACCOUNT_ARCHIVED");
    const live = await tx.transaction.findMany({ where: { userId, accountId: account.id, voidedAt: null } });
    const toVoid = live.filter(
      (t) =>
        (RESTART_VOIDABLE as readonly string[]).includes(t.type) &&
        ((input.removeAdjustments && t.type === "BALANCE_ADJUSTMENT") || dbToLocalDate(t.transactionDate) < input.startDate),
    );
    const voidedAt = new Date();
    if (toVoid.length) {
      await tx.transaction.updateMany({
        where: { id: { in: toVoid.map((t) => t.id) }, userId },
        data: { voidedAt, voidReason: "Учёт начат заново" },
      });
    }
    const voidedIds = new Set(toVoid.map((t) => t.id));
    const kept = live.filter((t) => !voidedIds.has(t.id));
    const effect = kept.reduce((sum, t) => sum.plus(balanceEffect({ direction: t.direction, amount: t.amount, status: t.status })), money(0));
    const opening = money(input.actualBalance).minus(effect);
    await tx.account.update({
      where: { id: account.id },
      data: { openingBalance: opening.toFixed(2), currentBalance: money(input.actualBalance).toFixed(2), trackingStartDate: localDateToDb(input.startDate) },
    });
    await writeAudit(tx, {
      userId,
      action: "ACCOUNT_RESTARTED",
      entityType: "Account",
      entityId: account.id,
      metadata: {
        startDate: input.startDate,
        actualBalance: input.actualBalance,
        before: { opening: toMoneyString(account.openingBalance), current: toMoneyString(account.currentBalance) },
        openingBalance: opening.toFixed(2),
        voided: toVoid.map((t) => t.id),
      },
    });
    return { voided: toVoid.length, openingBalance: opening.toFixed(2) };
  });
}

/**
 * The amount on the other account of a conversion: required when the
 * currencies differ (no invented rate), the same amount otherwise.
 */
async function counterpartSide(tx: Tx, userId: string, counterpartAccountId: string, ownCurrency: string, amount: string, counterpartAmount: string | undefined) {
  // Currency never changes after creation, so a plain read is enough; insertTransfer locks both accounts.
  const other = await tx.account.findFirst({ where: { id: counterpartAccountId, userId }, select: { currency: true } });
  if (!other) throw new NotFoundError("Account");
  if (other.currency === ownCurrency) return counterpartAmount ?? amount;
  if (counterpartAmount === undefined) {
    throw new DomainError(`Укажите, сколько это было в ${other.currency}.`, "TRANSFER_CONVERSION", { counterpartAmount: `Укажите сумму в ${other.currency}` });
  }
  return counterpartAmount;
}

/**
 * Brings `accountId` to `targetBalance` with a transfer from/to another
 * account (e.g. dollars bought with sums) instead of a balance adjustment.
 * `counterpartAmount` is what left or reached the other account; it may be
 * omitted only when both accounts share a currency. Null when nothing changes.
 */
export async function adjustBalanceByTransfer(
  userId: string,
  input: { accountId: string; targetBalance: string; date: LocalDate; note?: string; counterpartAccountId: string; counterpartAmount?: string },
): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const account = await lockOwnedAccount(tx, userId, input.accountId);
    const delta = money(input.targetBalance).minus(money(account.currentBalance));
    if (delta.isZero()) return null;
    const amount = delta.abs().toFixed(2);
    if (input.counterpartAccountId === account.id) throw new DomainError("Выберите другой счёт.", "SAME_ACCOUNT", { counterpartAccountId: "Выберите другой счёт" });
    const theirs = await counterpartSide(tx, userId, input.counterpartAccountId, account.currency, amount, input.counterpartAmount);
    const legs: TransferLegsInput = delta.gt(0)
      ? { fromAccountId: input.counterpartAccountId, toAccountId: account.id, amount: theirs, toAmount: amount, date: input.date, note: input.note }
      : { fromAccountId: account.id, toAccountId: input.counterpartAccountId, amount, toAmount: theirs, date: input.date, note: input.note };
    return (await insertTransfer(tx, userId, legs, null)).id;
  });
}

/**
 * Replaces a balance adjustment with the conversion it really was: the
 * adjustment is voided and a transfer with the other account is recorded on
 * the same date. The adjusted account's balance stays the same; the other
 * account moves by `counterpartAmount`.
 */
export async function convertAdjustmentToTransfer(
  userId: string,
  input: { id: string; counterpartAccountId: string; counterpartAmount?: string },
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const adj = await lockOwnedTransaction(tx, userId, input.id);
    if (adj.type !== "BALANCE_ADJUSTMENT") throw new DomainError("Конвертацией можно сделать только корректировку.", "NOT_ADJUSTMENT");
    if (adj.voidedAt) throw new DomainError("Эта корректировка уже аннулирована.", "VOIDED");
    if (adj.accountId === input.counterpartAccountId) {
      throw new DomainError("Выберите другой счёт.", "SAME_ACCOUNT", { counterpartAccountId: "Выберите другой счёт" });
    }
    const amount = toMoneyString(adj.amount);
    const date = dbToLocalDate(adj.transactionDate);
    const note = adj.note && adj.note !== "Корректировка баланса" ? adj.note : undefined;
    const theirs = await counterpartSide(tx, userId, input.counterpartAccountId, adj.currency, amount, input.counterpartAmount);
    const legs: TransferLegsInput =
      adj.direction === "INFLOW"
        ? { fromAccountId: input.counterpartAccountId, toAccountId: adj.accountId, amount: theirs, toAmount: amount, date, note }
        : { fromAccountId: adj.accountId, toAccountId: input.counterpartAccountId, amount, toAmount: theirs, date, note };

    await tx.transaction.update({ where: { id: adj.id }, data: { voidedAt: new Date(), voidReason: "Заменена конвертацией" } });
    await applyBalanceDelta(tx, adj.accountId, balanceEffect({ direction: adj.direction, amount: adj.amount, status: adj.status }).negated());
    const transfer = await insertTransfer(tx, userId, legs, null);
    await writeAudit(tx, {
      userId,
      action: "ADJUSTMENT_CONVERTED",
      entityType: "Transaction",
      entityId: adj.id,
      metadata: { transferId: transfer.id, counterpartAccountId: input.counterpartAccountId, counterpartAmount: input.counterpartAmount ?? amount },
    });
    return transfer;
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
      throw new DomainError("При переводе в одной валюте суммы совпадают.", "TRANSFER_AMOUNT", {
        toAmount: "Должна совпадать с отправленной суммой",
      });
    }
    return amount;
  }
  if (toAmount === undefined) {
    throw new DomainError(`Укажите сумму, полученную в ${toCurrency}.`, "TRANSFER_CONVERSION", {
      toAmount: `Укажите сумму, полученную в ${toCurrency}`,
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
  if (t.voidedAt) throw new DomainError("Аннулированную операцию нельзя изменить.", "VOIDED");
  const isTransfer = t.type === "TRANSFER";
  if (expected === "transfer" ? !isTransfer : t.type !== "EXPENSE" && t.type !== "INCOME") {
    throw new DomainError("Эту операцию здесь нельзя изменить.", "NOT_EDITABLE");
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
    assertTrackedDate(newAccount, input.date);
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
    if (!outLeg || !inLeg) throw new DomainError("Этот перевод неполный.", "BROKEN_TRANSFER");

    for (const leg of [outLeg, inLeg]) assertTrackedDate(await lockOwnedAccount(tx, userId, leg.accountId), input.date);
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
    if (target.voidedAt) throw new DomainError("Эта операция уже аннулирована.", "VOIDED");
    if (target.type === "DEBT_PAYMENT" || target.type === "LOAN_DISBURSEMENT") {
      throw new DomainError("Платёж по долгу отменяется в истории платежей этого долга.", "USE_DEBT_REVERSAL");
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
      throw new DomainError("Подтвердить можно только ожидаемый доход.", "NOT_EXPECTED");
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
