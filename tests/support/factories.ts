import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { createAccount } from "@/lib/services/accounts";
import { bootstrapUser } from "@/lib/services/bootstrap";
import type { AccountCreateInput } from "@/lib/validations/accounts";

export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
}

export async function createUser(name = "Test User") {
  const id = randomUUID();
  const user = await prisma.user.create({ data: { id, name, email: `${id}@test.fyndue.dev` } });
  await bootstrapUser(user.id);
  return user;
}

export async function createTestAccount(userId: string, overrides: Partial<AccountCreateInput> = {}) {
  return createAccount(userId, {
    name: "Uzcard",
    type: "BANK_CARD",
    currency: "UZS",
    openingBalance: "0.00",
    includeInTotal: true,
    ...overrides,
  });
}

export async function categoryId(userId: string, name: string, type: "EXPENSE" | "INCOME" = "EXPENSE") {
  const category = await prisma.category.findFirstOrThrow({ where: { userId, name, type } });
  return category.id;
}

export async function balanceOf(accountId: string) {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  return account.currentBalance.toFixed(2);
}

export const requestId = () => randomUUID();
