import { z } from "zod";
import { CATEGORY_COLORS } from "@/lib/constants/categories";
import { CURRENCIES } from "@/lib/constants/finance";
import { isLocalDate } from "@/lib/finance/dates";
import { MAX_MONEY, MONEY_SCALE, parseMoneyInput, toMoneyString } from "@/lib/finance/money";

export const idSchema = z.string().trim().min(1).max(64);

export const currencySchema = z.enum(CURRENCIES);

export const localDateSchema = z
  .string()
  .trim()
  .refine(isLocalDate, { message: "Enter a valid date" });

export const clientRequestIdSchema = z.uuid();

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((value) => (value ? value : undefined));

export const colorSchema = z.enum(CATEGORY_COLORS);

type MoneyOptions = { allowZero?: boolean; allowNegative?: boolean };

/**
 * Amount typed by a person → canonical decimal string ("2115000.00").
 * Validated as a string end to end; never converted to a JS number.
 */
export function moneySchema({ allowZero = false, allowNegative = false }: MoneyOptions = {}) {
  return z.string().transform((raw, ctx) => {
    const trimmed = raw.trim();
    const negative = allowNegative && /^[-−]/.test(trimmed);
    const parsed = parseMoneyInput(negative ? trimmed.slice(1) : trimmed);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: trimmed ? "Enter a valid amount" : "Amount is required" });
      return z.NEVER;
    }
    if (parsed.decimalPlaces() > MONEY_SCALE) {
      ctx.addIssue({ code: "custom", message: `Use at most ${MONEY_SCALE} decimal places` });
      return z.NEVER;
    }
    if (parsed.greaterThan(MAX_MONEY)) {
      ctx.addIssue({ code: "custom", message: "Amount is too large" });
      return z.NEVER;
    }
    if (parsed.isZero() && !allowZero) {
      ctx.addIssue({ code: "custom", message: "Amount must be greater than zero" });
      return z.NEVER;
    }
    return toMoneyString(negative ? parsed.negated() : parsed);
  });
}
