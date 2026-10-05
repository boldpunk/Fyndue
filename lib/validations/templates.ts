import { z } from "zod";
import { idSchema, moneySchema, optionalText } from "./common";

const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), idSchema.optional());

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(40),
  kind: z.enum(["EXPENSE", "INCOME"]),
  accountId: optionalId,
  categoryId: idSchema,
  amount: z.preprocess((v) => (typeof v === "string" && !v.trim() ? undefined : v), moneySchema().optional()),
  merchant: optionalText(80),
  note: optionalText(500),
});
export type TemplateCreateInput = z.output<typeof templateCreateSchema>;
