import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import type { Category, CategoryType } from "@/lib/generated/prisma/client";
import type {
  CategoryCreateInput,
  CategoryReorderInput,
  CategoryUpdateInput,
} from "@/lib/validations/categories";
import { writeAudit } from "./audit";
import { isUniqueViolation } from "./prisma-errors";

export type CategoryDTO = {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string | null;
  isSystem: boolean;
  isArchived: boolean;
  sortOrder: number;
  parentId: string | null;
};

function toCategoryDTO(c: Category): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    icon: c.icon,
    color: c.color,
    isSystem: c.isSystem,
    isArchived: c.isArchived,
    sortOrder: c.sortOrder,
    parentId: c.parentId,
  };
}

const duplicateName = () =>
  new DomainError("Категория с таким названием уже есть.", "DUPLICATE", {
    name: "Такое название уже есть",
  });

/**
 * A parent must be the user's own top-level, non-system category of the same
 * type; a category that already has subcategories can't become one itself.
 */
async function assertValidParent(tx: Tx, userId: string, type: CategoryType, parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return;
  const invalid = (message: string) => new DomainError(message, "VALIDATION", { parentId: message });
  if (parentId === selfId) throw invalid("Категория не может быть внутри самой себя.");
  const parent = await tx.category.findFirst({ where: { id: parentId, userId } });
  if (!parent) throw new NotFoundError("Category");
  if (parent.type !== type) throw invalid("Выберите категорию того же типа.");
  if (parent.parentId) throw invalid("Подкатегории — только на один уровень.");
  if (parent.isSystem) throw invalid("Внутрь системной категории добавлять нельзя.");
  if (selfId && (await tx.category.count({ where: { parentId: selfId, userId } })) > 0) {
    throw invalid("У этой категории есть свои подкатегории.");
  }
}

export async function listCategories(
  userId: string,
  options: { type?: CategoryType; includeArchived?: boolean; includeSystem?: boolean } = {},
): Promise<CategoryDTO[]> {
  const categories = await prisma.category.findMany({
    where: {
      userId,
      ...(options.type ? { type: options.type } : {}),
      ...(options.includeArchived ? {} : { isArchived: false }),
      ...(options.includeSystem === false ? { isSystem: false } : {}),
    },
    orderBy: [{ type: "asc" }, { isArchived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return categories.map(toCategoryDTO);
}

export async function createCategory(userId: string, input: CategoryCreateInput): Promise<CategoryDTO> {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertValidParent(tx, userId, input.type, input.parentId);
      const last = await tx.category.aggregate({
        where: { userId, type: input.type },
        _max: { sortOrder: true },
      });
      const category = await tx.category.create({
        data: {
          userId,
          name: input.name,
          type: input.type,
          icon: input.icon,
          color: input.color ?? null,
          parentId: input.parentId ?? null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      await writeAudit(tx, {
        userId,
        action: "CATEGORY_CREATED",
        entityType: "Category",
        entityId: category.id,
        metadata: { name: category.name, type: category.type },
      });
      return toCategoryDTO(category);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateName();
    throw error;
  }
}

export async function updateCategory(userId: string, input: CategoryUpdateInput): Promise<CategoryDTO> {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.category.findFirst({ where: { id: input.id, userId } });
      if (!before) throw new NotFoundError("Category");
      if (input.parentId !== undefined) {
        if (input.parentId && before.isSystem) throw new DomainError("Системную категорию нельзя сделать подкатегорией.");
        await assertValidParent(tx, userId, before.type, input.parentId, before.id);
      }
      const category = await tx.category.update({
        where: { id: before.id },
        data: { name: input.name, icon: input.icon, color: input.color ?? null, ...(input.parentId !== undefined ? { parentId: input.parentId } : {}) },
      });
      await writeAudit(tx, {
        userId,
        action: "CATEGORY_UPDATED",
        entityType: "Category",
        entityId: category.id,
        metadata: { before: { name: before.name, icon: before.icon }, after: { name: category.name, icon: category.icon } },
      });
      return toCategoryDTO(category);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateName();
    throw error;
  }
}

export async function setCategoryArchived(userId: string, id: string, archived: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({ where: { id, userId } });
    if (!category) throw new NotFoundError("Category");
    if (category.isSystem && archived) {
      throw new DomainError(`«${category.name}» используется приложением, её нельзя архивировать.`, "SYSTEM_CATEGORY");
    }
    await tx.category.update({ where: { id: category.id }, data: { isArchived: archived } });
    await writeAudit(tx, {
      userId,
      action: archived ? "CATEGORY_ARCHIVED" : "CATEGORY_UNARCHIVED",
      entityType: "Category",
      entityId: id,
    });
  });
}

/** Persists a new order for all categories of one type. */
export async function reorderCategories(userId: string, input: CategoryReorderInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const owned = await tx.category.findMany({
      where: { userId, type: input.type, id: { in: input.orderedIds } },
      select: { id: true },
    });
    if (owned.length !== new Set(input.orderedIds).size) throw new NotFoundError("Category");
    for (const [index, id] of input.orderedIds.entries()) {
      await tx.category.update({ where: { id }, data: { sortOrder: index } });
    }
    await writeAudit(tx, {
      userId,
      action: "CATEGORIES_REORDERED",
      entityType: "Category",
      entityId: input.type,
      metadata: { count: input.orderedIds.length },
    });
  });
}
