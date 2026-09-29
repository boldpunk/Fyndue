import { z } from "zod";
import { ACCOUNT_TYPES } from "@/lib/constants/finance";
import { colorSchema, currencySchema, idSchema, localDateSchema, moneySchema, optionalText } from "./common";

const accountFields = {
  name: z.string().trim().min(1, "Name is required").max(60),
  type: z.enum(ACCOUNT_TYPES),
  includeInTotal: z.boolean(),
  bank: optionalText(60),
  color: colorSchema.optional(),
  openingBalance: moneySchema({ allowZero: true, allowNegative: true }),
};

export const accountCreateSchema = z.object({ ...accountFields, currency: currencySchema });
export type AccountCreateInput = z.output<typeof accountCreateSchema>;
export type AccountCreateFormValues = z.input<typeof accountCreateSchema>;

/** Currency is fixed after creation: it would silently re-denominate history. */
export const accountUpdateSchema = z.object({ id: idSchema, ...accountFields });
export type AccountUpdateInput = z.output<typeof accountUpdateSchema>;

export const balanceAdjustmentSchema = z.object({
  accountId: idSchema,
  targetBalance: moneySchema({ allowZero: true, allowNegative: true }),
  date: localDateSchema,
  note: optionalText(200),
});
export type BalanceAdjustmentInput = z.output<typeof balanceAdjustmentSchema>;
export type BalanceAdjustmentFormValues = z.input<typeof balanceAdjustmentSchema>;

export const archiveSchema = z.object({ id: idSchema, archived: z.boolean() });
