import { z } from "zod";
import { DAY_COUNT_CONVENTIONS, DEBT_TYPES, FEE_MODES, REPAYMENT_TYPES } from "@/lib/constants/debts";
import { clientRequestIdSchema, currencySchema, idSchema, localDateSchema, moneySchema, optionalText } from "./common";

/** Empty → undefined; otherwise a validated amount (zero allowed). */
const optionalAmount = () =>
  z
    .string()
    .transform((v) => (v.trim() ? v : undefined))
    .pipe(moneySchema({ allowZero: true }).optional())
    .optional();

/** Annual rate in percent, e.g. "24" or "23.9". */
export const percentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}([.,]\d{1,6})?$/, "Введите ставку, например 24 или 23,9")
  .transform((v) => v.replace(",", "."))
  .refine((v) => Number.parseFloat(v) <= 999, "Слишком высокая ставка");

const optionalInt = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).optional().or(z.literal("").transform(() => undefined));

export const manualLineSchema = z.object({
  dueDate: localDateSchema,
  principal: moneySchema({ allowZero: true }),
  interest: optionalAmount(),
  fees: optionalAmount(),
});

export const knownTotalLineSchema = z.object({ dueDate: localDateSchema, total: moneySchema() });

export const debtCreateSchema = z
  .object({
    clientRequestId: clientRequestIdSchema,
    type: z.enum(DEBT_TYPES),
    name: z.string().trim().min(1, "Введите название").max(80),
    lender: optionalText(80),
    currency: currencySchema,
    repaymentType: z.enum(REPAYMENT_TYPES),
    originalPrincipal: moneySchema(),
    paidBeforeTracking: optionalAmount(),
    feeMode: z.enum(FEE_MODES).default("NONE"),
    originationFee: optionalAmount(),
    netAmountReceived: optionalAmount(),
    annualInterestRate: percentSchema.optional(),
    dayCountConvention: z.enum(DAY_COUNT_CONVENTIONS).default("MONTHLY_30_360"),
    roundingScale: z.union([z.literal(0), z.literal(2)]).default(2),
    startDate: localDateSchema,
    firstPaymentDate: localDateSchema,
    paymentDay: optionalInt(1, 31),
    /** Move payments off weekends and public holidays, like banks do. */
    shiftWeekends: z.boolean().default(false),
    termMonths: optionalInt(1, 600),
    installmentAmount: optionalAmount(),
    knownTotalRepayment: z.boolean().default(false),
    manualLines: z.array(manualLineSchema).max(600).optional(),
    knownTotalLines: z.array(knownTotalLineSchema).max(600).optional(),
    disbursementAccountId: idSchema.optional(),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    const interestBearing = v.repaymentType === "DIFFERENTIAL" || v.repaymentType === "ANNUITY";
    if (interestBearing && !v.knownTotalRepayment) {
      if (v.annualInterestRate === undefined) ctx.addIssue({ code: "custom", path: ["annualInterestRate"], message: "Укажите годовую ставку" });
      if (!v.termMonths) ctx.addIssue({ code: "custom", path: ["termMonths"], message: "Укажите количество платежей" });
    }
    if (v.feeMode !== "NONE" && v.feeMode !== "CUSTOM" && v.originationFee === undefined) {
      ctx.addIssue({ code: "custom", path: ["originationFee"], message: "Укажите комиссию" });
    }
  });

export type DebtCreateInput = z.output<typeof debtCreateSchema>;
export type DebtCreateFormValues = z.input<typeof debtCreateSchema>;

export const debtUpdateSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, "Введите название").max(80),
  lender: optionalText(80),
  notes: optionalText(1000),
});

const breakdownFields = {
  principal: moneySchema({ allowZero: true }),
  interest: moneySchema({ allowZero: true }),
  originationFee: moneySchema({ allowZero: true }),
  processingFee: moneySchema({ allowZero: true }),
  penalty: moneySchema({ allowZero: true }),
  otherFee: moneySchema({ allowZero: true }),
};

export const recordPaymentSchema = z.object({
  clientRequestId: clientRequestIdSchema,
  debtId: idSchema,
  scheduleItemId: idSchema.optional(),
  accountId: idSchema,
  paymentDate: localDateSchema,
  ...breakdownFields,
  /** Close the installment even if interest/fees came out lower than planned. */
  settlesItem: z.boolean().default(false),
  note: optionalText(500),
});
export type RecordPaymentInput = z.output<typeof recordPaymentSchema>;

export const earlyRepaymentSchema = z.object({
  clientRequestId: clientRequestIdSchema,
  debtId: idSchema,
  accountId: idSchema,
  paymentDate: localDateSchema,
  amount: moneySchema(),
  processingFee: moneySchema({ allowZero: true }),
  strategy: z.enum(["REDUCE_TERM", "REDUCE_PAYMENT"]).default("REDUCE_TERM"),
  note: optionalText(500),
});
export type EarlyRepaymentInput = z.output<typeof earlyRepaymentSchema>;

export const earlyRepaymentPreviewSchema = z.object({
  debtId: idSchema,
  amount: moneySchema(),
  strategy: z.enum(["REDUCE_TERM", "REDUCE_PAYMENT"]).default("REDUCE_TERM"),
});

export const reversePaymentSchema = z.object({
  paymentId: idSchema,
  reason: z.string().trim().min(3, "Коротко укажите причину (от 3 символов)").max(200),
});

export const replaceScheduleSchema = z.object({
  debtId: idSchema,
  reason: z.enum(["MANUAL_EDIT", "BANK_IMPORT"]),
  note: optionalText(200),
  lines: z.array(manualLineSchema).min(1).max(600),
});
export type ReplaceScheduleInput = z.output<typeof replaceScheduleSchema>;

export const weekendShiftSchema = z.object({ id: idSchema, shiftWeekends: z.boolean() });
