import "server-only";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { toMoneyString } from "@/lib/finance/money";
import type { TemplateCreateInput } from "@/lib/validations/templates";
import { writeAudit } from "./audit";

/** Saved operations for one-tap entry in the quick-add form. */

export const MAX_TEMPLATES = 30;

export type TemplateDTO = {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  accountId: string | null;
  categoryId: string;
  amount: string | null;
  merchant: string | null;
  note: string | null;
};

export async function listTemplates(userId: string): Promise<TemplateDTO[]> {
  const rows = await prisma.transactionTemplate.findMany({
    where: { userId, category: { isArchived: false } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.type === "INCOME" ? "INCOME" : "EXPENSE",
    accountId: t.accountId,
    categoryId: t.categoryId,
    amount: t.amount ? toMoneyString(t.amount) : null,
    merchant: t.merchant,
    note: t.note,
  }));
}

export async function createTemplate(userId: string, input: TemplateCreateInput): Promise<{ id: string }> {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId, isArchived: false, isSystem: false } });
  if (!category) throw new NotFoundError("Category");
  if (category.type !== input.kind) throw new DomainError("Категория не подходит к типу операции.", "VALIDATION", { categoryId: "Выберите другую категорию" });
  if (input.accountId && !(await prisma.account.findFirst({ where: { id: input.accountId, userId, isArchived: false } }))) throw new NotFoundError("Account");
  const count = await prisma.transactionTemplate.count({ where: { userId } });
  if (count >= MAX_TEMPLATES) throw new DomainError(`Можно сохранить до ${MAX_TEMPLATES} шаблонов. Удалите лишние в Настройках.`);

  return prisma.$transaction(async (tx) => {
    const template = await tx.transactionTemplate.create({
      data: {
        userId,
        name: input.name,
        type: input.kind,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId,
        amount: input.amount ?? null,
        merchant: input.merchant ?? null,
        note: input.note ?? null,
        sortOrder: count,
      },
    });
    await writeAudit(tx, { userId, action: "TEMPLATE_CREATED", entityType: "TransactionTemplate", entityId: template.id, metadata: { kind: input.kind } });
    return { id: template.id };
  });
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.transactionTemplate.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundError("Template");
    await writeAudit(tx, { userId, action: "TEMPLATE_DELETED", entityType: "TransactionTemplate", entityId: id });
  });
}
