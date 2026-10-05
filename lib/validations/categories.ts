import { z } from "zod";
import { CATEGORY_ICONS } from "@/lib/constants/categories";
import { colorSchema, idSchema } from "./common";

export const categoryTypeSchema = z.enum(["EXPENSE", "INCOME"]);

const categoryFields = {
  name: z.string().trim().min(1, "Введите название").max(40),
  icon: z.enum(CATEGORY_ICONS),
  color: colorSchema.optional(),
  /** Subcategory of this one (one level). Empty = top level. */
  parentId: z.preprocess((v) => (v === "" ? null : v), idSchema.nullable().optional()),
};

export const categoryCreateSchema = z.object({ ...categoryFields, type: categoryTypeSchema });
export type CategoryCreateInput = z.output<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z.object({ id: idSchema, ...categoryFields });
export type CategoryUpdateInput = z.output<typeof categoryUpdateSchema>;

export const categoryReorderSchema = z.object({
  type: categoryTypeSchema,
  orderedIds: z.array(idSchema).min(1).max(500),
});
export type CategoryReorderInput = z.output<typeof categoryReorderSchema>;
