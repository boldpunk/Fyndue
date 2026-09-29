"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  createCategory,
  reorderCategories,
  setCategoryArchived,
  updateCategory,
} from "@/lib/services/categories";
import { runAction } from "@/lib/utils/action";
import { archiveSchema } from "@/lib/validations/accounts";
import {
  categoryCreateSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
} from "@/lib/validations/categories";

const refresh = () => revalidatePath("/", "layout");

export async function createCategoryAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const category = await createCategory(user.id, categoryCreateSchema.parse(input));
    refresh();
    return { id: category.id };
  });
}

export async function updateCategoryAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await updateCategory(user.id, categoryUpdateSchema.parse(input));
    refresh();
    return null;
  });
}

export async function archiveCategoryAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { id, archived } = archiveSchema.parse(input);
    await setCategoryArchived(user.id, id, archived);
    refresh();
    return null;
  });
}

export async function reorderCategoriesAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await reorderCategories(user.id, categoryReorderSchema.parse(input));
    refresh();
    return null;
  });
}
