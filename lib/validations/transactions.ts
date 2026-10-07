import { z } from "zod";
import { TRANSACTION_TYPES } from "@/lib/constants/finance";
import { clientRequestIdSchema, idSchema, localDateSchema, moneySchema, optionalText } from "./common";

/** Empty input → undefined; otherwise a validated positive amount. */
const optionalMoney = () =>
  z
    .string()
    .transform((v) => (v.trim() ? v : undefined))
    .pipe(moneySchema().optional())
    .optional();

const cashFlowFields = {
  accountId: idSchema,
  categoryId: idSchema,
  amount: moneySchema(),
  date: localDateSchema,
  merchant: optionalText(80),
  note: optionalText(500),
};

export const expenseSchema = z.object({ kind: z.literal("EXPENSE"), ...cashFlowFields });
export const incomeSchema = z.object({
  kind: z.literal("INCOME"),
  ...cashFlowFields,
  /** Expected income never moves a balance until confirmed (SPEC §28). */
  status: z.enum(["ACTUAL", "EXPECTED"]).default("ACTUAL"),
});

export const transferSchema = z
  .object({
    kind: z.literal("TRANSFER"),
    fromAccountId: idSchema,
    toAccountId: idSchema,
    amount: moneySchema(),
    /** Amount credited to the destination; required when currencies differ. */
    toAmount: optionalMoney(),
    date: localDateSchema,
    note: optionalText(500),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Выберите два разных счёта",
    path: ["toAccountId"],
  });

export const transactionCreateSchema = z
  .discriminatedUnion("kind", [expenseSchema, incomeSchema, transferSchema])
  .and(z.object({ clientRequestId: clientRequestIdSchema }));

export type ExpenseInput = z.output<typeof expenseSchema>;
export type IncomeInput = z.output<typeof incomeSchema>;
export type TransferInput = z.output<typeof transferSchema>;
export type TransactionCreateInput = z.output<typeof transactionCreateSchema>;
export type TransactionCreateFormValues = z.input<typeof transactionCreateSchema>;

export const cashFlowUpdateSchema = z.object({
  id: idSchema,
  ...cashFlowFields,
  status: z.enum(["ACTUAL", "EXPECTED"]).optional(),
});
export type CashFlowUpdateInput = z.output<typeof cashFlowUpdateSchema>;

export const transferUpdateSchema = z.object({
  id: idSchema,
  amount: moneySchema(),
  toAmount: optionalMoney(),
  date: localDateSchema,
  note: optionalText(500),
});
export type TransferUpdateInput = z.output<typeof transferUpdateSchema>;

/** A balance adjustment that was really a conversion with another account. */
export const convertAdjustmentSchema = z.object({
  id: idSchema,
  counterpartAccountId: idSchema,
  counterpartAmount: z.preprocess((v) => (typeof v === "string" && !v.trim() ? undefined : v), moneySchema().optional()),
});

/** Date (and, for a loan disbursement, amount and account) of an operation the form doesn't edit. */
export const correctTransactionSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  amount: z.preprocess((v) => (typeof v === "string" && !v.trim() ? undefined : v), moneySchema().optional()),
  accountId: z.preprocess((v) => (v === "" ? undefined : v), idSchema.optional()),
});

export const voidTransactionSchema = z.object({ id: idSchema, reason: optionalText(200) });

export const transactionFiltersSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional().catch(undefined),
  account: idSchema.optional().catch(undefined),
  category: idSchema.optional().catch(undefined),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type TransactionFilters = z.output<typeof transactionFiltersSchema>;
