import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { dbToLocalDate, localDateToDb, todayIn, type LocalDate } from "@/lib/finance/dates";
import { money, toMoneyString } from "@/lib/finance/money";
import { monthlyEquivalent, nextOccurrence, occurrencesBetween } from "@/lib/finance/recurrence";
import type { RecurringTransaction } from "@/lib/generated/prisma/client";
import type { RecordOccurrenceInput, RecurringInput } from "@/lib/validations/planning";
import { writeAudit } from "./audit";
import { isUniqueViolation } from "./prisma-errors";
import { createTransaction } from "./transactions";

export type RecurringDTO = {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  amount: string;
  currency: string;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  startDate: string;
  endDate: string | null;
  isSubscription: boolean;
  isActive: boolean;
  note: string | null;
  url: string | null;
  account: { id: string; name: string };
  category: { id: string; name: string; icon: string; color: string | null } | null;
  nextOccurrence: string | null;
  /** Average per month, for totals. */
  monthlyEquivalent: string;
};

const include = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, icon: true, color: true } },
} as const;

type RuleWithRelations = RecurringTransaction & {
  account: { id: string; name: string };
  category: { id: string; name: string; icon: string; color: string | null } | null;
};

const ruleOf = (r: RecurringTransaction) => ({
  frequency: r.frequency,
  interval: r.interval,
  startDate: dbToLocalDate(r.startDate),
  endDate: r.endDate ? dbToLocalDate(r.endDate) : null,
});

function toDTO(r: RuleWithRelations, today: LocalDate): RecurringDTO {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    amount: toMoneyString(r.amount),
    currency: r.currency,
    frequency: r.frequency,
    interval: r.interval,
    startDate: dbToLocalDate(r.startDate),
    endDate: r.endDate ? dbToLocalDate(r.endDate) : null,
    isSubscription: r.isSubscription,
    isActive: r.isActive,
    note: r.note,
    url: r.url,
    account: r.account,
    category: r.category,
    nextOccurrence: r.isActive ? nextOccurrence(ruleOf(r), today) : null,
    monthlyEquivalent: toMoneyString(monthlyEquivalent(r.amount, r.frequency, r.interval)),
  };
}

async function userToday(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  return todayIn(user.timezone);
}

export async function listRecurring(userId: string): Promise<RecurringDTO[]> {
  const today = await userToday(userId);
  const rules = await prisma.recurringTransaction.findMany({
    where: { userId },
    include,
    orderBy: [{ isActive: "desc" }, { kind: "asc" }, { name: "asc" }],
  });
  return rules.map((r) => toDTO(r, today));
}

async function validateRefs(tx: Tx, userId: string, input: RecurringInput) {
  const account = await tx.account.findFirst({ where: { id: input.accountId, userId } });
  if (!account) throw new NotFoundError("Account");
  if (account.isArchived) throw new DomainError("Этот счёт в архиве.", "ACCOUNT_ARCHIVED", { accountId: "Счёт в архиве" });
  const category = await tx.category.findFirst({ where: { id: input.categoryId, userId } });
  if (!category) throw new NotFoundError("Category");
  if (category.type !== input.kind || category.isSystem) {
    throw new DomainError("Выберите подходящую категорию.", "CATEGORY_TYPE", { categoryId: "Выберите подходящую категорию" });
  }
  return account;
}

function ruleData(input: RecurringInput, currency: RecurringTransaction["currency"]) {
  return {
    name: input.name,
    kind: input.kind,
    accountId: input.accountId,
    categoryId: input.categoryId,
    amount: input.amount,
    currency,
    frequency: input.frequency,
    interval: input.interval,
    startDate: localDateToDb(input.startDate),
    endDate: input.endDate ? localDateToDb(input.endDate) : null,
    isSubscription: input.kind === "EXPENSE" && input.isSubscription,
    note: input.note ?? null,
    url: input.isSubscription && input.kind === "EXPENSE" ? (input.url ?? null) : null,
  };
}

export async function createRecurring(userId: string, input: RecurringInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const account = await validateRefs(tx, userId, input);
    const rule = await tx.recurringTransaction.create({ data: { userId, ...ruleData(input, account.currency) } });
    await writeAudit(tx, { userId, action: "RECURRING_CREATED", entityType: "RecurringTransaction", entityId: rule.id, metadata: { kind: input.kind, amount: input.amount } });
    return { id: rule.id };
  });
}

export async function updateRecurring(userId: string, id: string, input: RecurringInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.recurringTransaction.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Recurring item");
    const account = await validateRefs(tx, userId, input);
    await tx.recurringTransaction.update({ where: { id }, data: ruleData(input, account.currency) });
    await writeAudit(tx, { userId, action: "RECURRING_UPDATED", entityType: "RecurringTransaction", entityId: id, metadata: { amount: input.amount } });
  });
}

export async function setRecurringActive(userId: string, id: string, active: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.recurringTransaction.updateMany({ where: { id, userId }, data: { isActive: active } });
    if (result.count !== 1) throw new NotFoundError("Recurring item");
    await writeAudit(tx, { userId, action: active ? "RECURRING_RESUMED" : "RECURRING_PAUSED", entityType: "RecurringTransaction", entityId: id });
  });
}

/** Deleting a rule never touches transactions already recorded from it. */
export async function deleteRecurring(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rule = await tx.recurringTransaction.findFirst({ where: { id, userId } });
    if (!rule) throw new NotFoundError("Recurring item");
    await tx.recurringTransaction.delete({ where: { id } });
    await writeAudit(tx, { userId, action: "RECURRING_DELETED", entityType: "RecurringTransaction", entityId: id, metadata: { name: rule.name } });
  });
}

export type Occurrence = {
  recurringId: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  isSubscription: boolean;
  date: LocalDate;
  amount: string;
  currency: string;
  accountId: string;
  accountName: string;
  includeInTotal: boolean;
  category: { name: string; icon: string; color: string | null } | null;
  /** Set when a live transaction records this occurrence. */
  transactionId: string | null;
};

/** Occurrences of active rules in [from, to], each marked recorded or planned. */
export async function listOccurrences(userId: string, from: LocalDate, to: LocalDate): Promise<Occurrence[]> {
  const rules = await prisma.recurringTransaction.findMany({
    where: { userId, isActive: true, startDate: { lte: localDateToDb(to) } },
    include: { ...include, account: { select: { id: true, name: true, includeInTotal: true } } },
  });
  if (rules.length === 0) return [];
  const recorded = await prisma.transaction.findMany({
    where: {
      userId,
      voidedAt: null,
      recurringId: { in: rules.map((r) => r.id) },
      occurrenceDate: { gte: localDateToDb(from), lte: localDateToDb(to) },
    },
    select: { id: true, recurringId: true, occurrenceDate: true },
  });
  const recordedKey = new Map(recorded.map((t) => [`${t.recurringId}|${dbToLocalDate(t.occurrenceDate!)}`, t.id]));
  return rules
    .flatMap((r) =>
      occurrencesBetween(ruleOf(r), from, to).map((date) => ({
        recurringId: r.id,
        name: r.name,
        kind: r.kind,
        isSubscription: r.isSubscription,
        date,
        amount: toMoneyString(r.amount),
        currency: r.currency,
        accountId: r.account.id,
        accountName: r.account.name,
        includeInTotal: r.account.includeInTotal,
        category: r.category ? { name: r.category.name, icon: r.category.icon, color: r.category.color } : null,
        transactionId: recordedKey.get(`${r.id}|${date}`) ?? null,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/**
 * Records one occurrence as a real transaction (the user confirms it
 * happened). The amount may differ from the plan; each occurrence can be
 * recorded once (partial unique index), unless that transaction is voided.
 */
export async function recordOccurrence(userId: string, input: RecordOccurrenceInput): Promise<{ id: string }> {
  const rule = await prisma.recurringTransaction.findFirst({ where: { id: input.recurringId, userId } });
  if (!rule) throw new NotFoundError("Recurring item");
  const valid = occurrencesBetween(ruleOf(rule), input.occurrenceDate, input.occurrenceDate);
  if (valid.length !== 1) throw new DomainError("В эту дату этот платёж не запланирован.", "NOT_AN_OCCURRENCE");
  if (!rule.categoryId) throw new DomainError("Сначала укажите категорию для этого регулярного платежа.", "NO_CATEGORY");
  try {
    return await createTransaction(
      userId,
      rule.kind === "INCOME"
        ? {
            kind: "INCOME",
            status: "ACTUAL",
            accountId: input.accountId,
            categoryId: rule.categoryId,
            amount: input.amount,
            date: input.date,
            merchant: undefined,
            note: rule.name,
            clientRequestId: input.clientRequestId,
          }
        : {
            kind: "EXPENSE",
            accountId: input.accountId,
            categoryId: rule.categoryId,
            amount: input.amount,
            date: input.date,
            merchant: undefined,
            note: rule.name,
            clientRequestId: input.clientRequestId,
          },
      { recurringId: rule.id, occurrenceDate: input.occurrenceDate },
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("Этот платёж уже записан.", "ALREADY_RECORDED");
    throw error;
  }
}

/** Active items' average monthly outflow and inflow, per currency. */
export function recurringMonthlyTotals(items: RecurringDTO[]) {
  const totals = new Map<string, { expenses: ReturnType<typeof money>; income: ReturnType<typeof money> }>();
  for (const item of items.filter((i) => i.isActive)) {
    const t = totals.get(item.currency) ?? { expenses: money(0), income: money(0) };
    if (item.kind === "EXPENSE") t.expenses = t.expenses.plus(money(item.monthlyEquivalent));
    else t.income = t.income.plus(money(item.monthlyEquivalent));
    totals.set(item.currency, t);
  }
  return [...totals].map(([currency, t]) => ({ currency, expenses: toMoneyString(t.expenses), income: toMoneyString(t.income) }));
}
