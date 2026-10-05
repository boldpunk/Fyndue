import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { dbToLocalDate, localDateToDb, todayIn, type LocalDate } from "@/lib/finance/dates";
import { goalProgress, type GoalProgress } from "@/lib/finance/goals";
import { money, toMoneyString } from "@/lib/finance/money";
import type { Currency } from "@/lib/generated/prisma/client";
import type { GoalContributionInput, GoalCreateInput, GoalUpdateInput } from "@/lib/validations/goals";
import { writeAudit } from "./audit";

/**
 * Savings goals (docs/roadmap.md). A goal either follows an account — its
 * balance is the progress — or keeps its own «put aside» amount.
 */

export const MAX_GOALS = 50;

export type GoalDTO = {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  targetAmount: string;
  currency: Currency;
  targetDate: LocalDate | null;
  account: { id: string; name: string } | null;
  isArchived: boolean;
  progress: GoalProgress;
};

export async function listGoals(userId: string, options: { includeArchived?: boolean; now?: Date } = {}): Promise<{ today: LocalDate; goals: GoalDTO[] }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const today = todayIn(user.timezone, options.now);
  const rows = await prisma.savingsGoal.findMany({
    where: { userId, ...(options.includeArchived ? {} : { isArchived: false }) },
    include: { account: { select: { id: true, name: true, currentBalance: true, isArchived: true } } },
    orderBy: [{ isArchived: "asc" }, { createdAt: "asc" }],
  });
  const goals = rows.map((g) => {
    const targetDate = g.targetDate ? dbToLocalDate(g.targetDate) : null;
    const saved = g.account ? g.account.currentBalance : g.savedAmount;
    return {
      id: g.id,
      name: g.name,
      icon: g.icon,
      color: g.color,
      targetAmount: toMoneyString(g.targetAmount),
      currency: g.currency,
      targetDate,
      account: g.account ? { id: g.account.id, name: g.account.name } : null,
      isArchived: g.isArchived,
      progress: goalProgress({ target: g.targetAmount, saved, today, targetDate }),
    };
  });
  // Unfinished goals first, nearest deadline first.
  goals.sort((a, b) => Number(a.progress.state === "achieved") - Number(b.progress.state === "achieved") || (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"));
  return { today, goals };
}

/** A linked account must be the user's, active, and in the goal's currency. */
async function checkedAccountId(tx: Tx, userId: string, accountId: string | undefined, currency: Currency): Promise<string | null> {
  if (!accountId) return null;
  const account = await tx.account.findFirst({ where: { id: accountId, userId, isArchived: false } });
  if (!account) throw new NotFoundError("Account");
  if (account.currency !== currency) {
    throw new DomainError(`Счёт «${account.name}» в ${account.currency} — выберите ту же валюту цели.`, "VALIDATION", { currency: `Валюта счёта — ${account.currency}` });
  }
  return account.id;
}

export async function createGoal(userId: string, input: GoalCreateInput): Promise<{ id: string }> {
  if ((await prisma.savingsGoal.count({ where: { userId, isArchived: false } })) >= MAX_GOALS) {
    throw new DomainError(`Можно вести до ${MAX_GOALS} целей.`);
  }
  return prisma.$transaction(async (tx) => {
    const accountId = await checkedAccountId(tx, userId, input.accountId, input.currency);
    const goal = await tx.savingsGoal.create({
      data: {
        userId,
        name: input.name,
        icon: input.icon,
        color: input.color ?? null,
        targetAmount: input.targetAmount,
        currency: input.currency,
        accountId,
        savedAmount: accountId ? "0" : (input.savedAmount ?? "0"),
        targetDate: input.targetDate ? localDateToDb(input.targetDate) : null,
      },
    });
    await writeAudit(tx, { userId, action: "GOAL_CREATED", entityType: "SavingsGoal", entityId: goal.id, metadata: { targetAmount: input.targetAmount, currency: input.currency } });
    return { id: goal.id };
  });
}

export async function updateGoal(userId: string, input: GoalUpdateInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const goal = await tx.savingsGoal.findFirst({ where: { id: input.id, userId } });
    if (!goal) throw new NotFoundError("Goal");
    const accountId = await checkedAccountId(tx, userId, input.accountId, input.currency);
    await tx.savingsGoal.update({
      where: { id: goal.id },
      data: {
        name: input.name,
        icon: input.icon,
        color: input.color ?? null,
        targetAmount: input.targetAmount,
        currency: input.currency,
        accountId,
        targetDate: input.targetDate ? localDateToDb(input.targetDate) : null,
      },
    });
    await writeAudit(tx, { userId, action: "GOAL_UPDATED", entityType: "SavingsGoal", entityId: goal.id, metadata: { targetAmount: input.targetAmount } });
  });
}

/** Puts money aside (or takes it back) on a goal without an account. */
export async function contributeToGoal(userId: string, input: GoalContributionInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SavingsGoal" WHERE "id" = ${input.id} AND "userId" = ${userId} FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundError("Goal");
    const goal = await tx.savingsGoal.findUniqueOrThrow({ where: { id: input.id } });
    if (goal.accountId) throw new DomainError("Эта цель копится на счёте — пополните счёт переводом.");
    const next = money(goal.savedAmount).plus(input.amount);
    if (next.isNegative()) throw new DomainError("Нельзя забрать больше, чем отложено.", "VALIDATION", { amount: `Отложено ${toMoneyString(goal.savedAmount)}` });
    const achieved = next.gte(goal.targetAmount);
    await tx.savingsGoal.update({
      where: { id: goal.id },
      data: { savedAmount: toMoneyString(next), achievedAt: achieved ? (goal.achievedAt ?? new Date()) : null },
    });
    await writeAudit(tx, { userId, action: "GOAL_CONTRIBUTED", entityType: "SavingsGoal", entityId: goal.id, metadata: { amount: input.amount } });
  });
}

export async function setGoalArchived(userId: string, id: string, archived: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.savingsGoal.updateMany({ where: { id, userId }, data: { isArchived: archived } });
    if (count === 0) throw new NotFoundError("Goal");
    await writeAudit(tx, { userId, action: "GOAL_ARCHIVED", entityType: "SavingsGoal", entityId: id, metadata: { archived } });
  });
}
