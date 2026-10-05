import { z } from "zod";
import { CATEGORY_ICONS } from "@/lib/constants/categories";
import { colorSchema, currencySchema, idSchema, localDateSchema, moneySchema } from "./common";

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

const goalFields = {
  name: z.string().trim().min(1, "Введите название").max(60),
  icon: z.enum(CATEGORY_ICONS).default("piggy-bank"),
  color: optional(colorSchema),
  targetAmount: moneySchema(),
  currency: currencySchema,
  /** Saving on this account: its balance is the progress. */
  accountId: optional(idSchema),
  targetDate: optional(localDateSchema),
};

export const goalCreateSchema = z.object({
  ...goalFields,
  /** Already put aside (goals without an account). */
  savedAmount: optional(moneySchema({ allowZero: true })),
});
export type GoalCreateInput = z.output<typeof goalCreateSchema>;

export const goalUpdateSchema = z.object({ id: idSchema, ...goalFields });
export type GoalUpdateInput = z.output<typeof goalUpdateSchema>;

/** Positive puts money aside, negative takes it back. */
export const goalContributionSchema = z.object({ id: idSchema, amount: moneySchema({ allowNegative: true }) });
export type GoalContributionInput = z.output<typeof goalContributionSchema>;
