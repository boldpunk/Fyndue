import { z } from "zod";
import { CURRENCIES } from "@/lib/constants/finance";
import { clientRequestIdSchema, idSchema, localDateSchema, moneySchema, optionalText } from "./common";

export const recurringSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60),
    kind: z.enum(["EXPENSE", "INCOME"]),
    accountId: idSchema,
    categoryId: idSchema,
    amount: moneySchema(),
    frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
    interval: z.coerce.number().int().min(1, "At least 1").max(60),
    startDate: localDateSchema,
    endDate: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() ? v : undefined))
      .pipe(localDateSchema.optional()),
    isSubscription: z.boolean().default(false),
    note: optionalText(200),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "Ends before it starts", path: ["endDate"] });
export type RecurringInput = z.output<typeof recurringSchema>;

export const recurringUpdateSchema = z.intersection(recurringSchema, z.object({ id: idSchema }));

export const recordOccurrenceSchema = z.object({
  clientRequestId: clientRequestIdSchema,
  recurringId: idSchema,
  occurrenceDate: localDateSchema,
  /** The amount actually paid/received; defaults to the rule's amount. */
  amount: moneySchema(),
  date: localDateSchema,
  accountId: idSchema,
});
export type RecordOccurrenceInput = z.output<typeof recordOccurrenceSchema>;

export const budgetSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
  categoryId: idSchema.optional(),
  currency: z.enum(CURRENCIES),
  amount: moneySchema(),
});
export type BudgetInput = z.output<typeof budgetSchema>;

export const copyBudgetsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
});

export const exchangeRateSchema = z
  .object({
    fromCurrency: z.enum(CURRENCIES),
    toCurrency: z.enum(CURRENCIES),
    rate: z
      .string()
      .trim()
      .regex(/^\d{1,12}([.,]\d{1,8})?$/, "Enter a rate like 12700 or 0.0000725")
      .transform((v) => v.replace(",", "."))
      .refine((v) => Number.parseFloat(v) > 0, "Rate must be positive"),
    effectiveDate: localDateSchema,
  })
  .refine((v) => v.fromCurrency !== v.toCurrency, { message: "Choose two different currencies", path: ["toCurrency"] });
export type ExchangeRateInput = z.output<typeof exchangeRateSchema>;
