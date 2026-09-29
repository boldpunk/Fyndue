import "server-only";
import { prisma } from "@/lib/db";
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
  };
}

const duplicateName = () =>
  new DomainError("A category with this name already exists.", "DUPLICATE", {
    name: "A category with this name already exists",
  });

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
      const category = await tx.category.update({
        where: { id: before.id },
        data: { name: input.name, icon: input.icon, color: input.color ?? null },
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
      throw new DomainError(`"${category.name}" is used by Fyndue and can't be archived.`, "SYSTEM_CATEGORY");
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
