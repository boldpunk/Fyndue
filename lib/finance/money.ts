/**
 * Money primitives. All financial arithmetic in Fyndue goes through Decimal —
 * never JavaScript floating point (SPEC §45).
 *
 * This module is pure and isomorphic: it is safe to import from client
 * components (for formatting and input parsing) and from the server.
 */
import Decimal from "decimal.js";
import { APP_LOCALE } from "@/lib/constants/locale";

// A dedicated Decimal constructor so global configuration of other libraries
// can never change our rounding behaviour.
export const FinDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40,
});
export type FinDecimal = InstanceType<typeof FinDecimal>;

/** Minor-unit digits stored for every supported currency (UZS, USD, EUR, RUB). */
export const MONEY_SCALE = 2;

/** Largest absolute amount that fits NUMERIC(20, 2). */
export const MAX_MONEY = new FinDecimal("999999999999999999.99");

export type MoneyLike = FinDecimal | Decimal | string | bigint | number | { toString(): string };

/**
 * Builds a Decimal. Numbers are accepted only when they are safe integers,
 * so a float such as `0.1 + 0.2` can never silently enter a calculation.
 */
export function money(value: MoneyLike): FinDecimal {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`Refusing to build money from non-integer number ${value}; pass a string.`);
    }
    return new FinDecimal(value);
  }
  if (typeof value === "bigint") return new FinDecimal(value.toString());
  if (typeof value === "string") return new FinDecimal(value.trim());
  // Decimal instances (ours or Prisma's) expose an exact toString().
  return new FinDecimal(value.toString());
}

export const ZERO = new FinDecimal(0);

export function roundMoney(value: MoneyLike, scale: number = MONEY_SCALE): FinDecimal {
  return money(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

export function sumMoney(values: Iterable<MoneyLike>): FinDecimal {
  let total = ZERO;
  for (const value of values) total = total.plus(money(value));
  return total;
}

/** Canonical storage/transport string with exactly MONEY_SCALE decimals, e.g. "49986962.63". */
export function toMoneyString(value: MoneyLike, scale: number = MONEY_SCALE): string {
  return roundMoney(value, scale).toFixed(scale);
}

export function isValidMoneyScale(value: MoneyLike, scale: number = MONEY_SCALE): boolean {
  return money(value).decimalPlaces() <= scale;
}

/**
 * Parses what a person types into an amount field. Accepts spaces, NBSPs,
 * apostrophes and commas/dots as grouping, and either "," or "." as the
 * decimal separator:
 *
 *   "1 234 567,89" → 1234567.89     "1,234,567.89" → 1234567.89
 *   "3500000"      → 3500000        "1,500"        → 1500
 *
 * Returns null for anything that is not a plain non-negative number.
 */
export function parseMoneyInput(input: string): FinDecimal | null {
  const text = input.trim().replace(/[\s\u00a0\u202f'’_]/g, "");
  if (!/^[\d.,]+$/.test(text)) return null;

  const commaCount = text.split(",").length - 1;
  const dotCount = text.split(".").length - 1;

  // Decide which character (if any) is the decimal separator.
  let decimalSep: "," | "." | null = null;
  if (commaCount > 0 && dotCount > 0) {
    decimalSep = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
  } else if (commaCount === 1) {
    // "1,500" is grouping; "12,5" / "12,50" is a decimal comma.
    decimalSep = text.length - text.lastIndexOf(",") - 1 === 3 ? null : ",";
  } else if (dotCount === 1) {
    decimalSep = ".";
  }

  let integerPart = text;
  let fractionPart = "";
  if (decimalSep) {
    const index = text.lastIndexOf(decimalSep);
    integerPart = text.slice(0, index);
    fractionPart = text.slice(index + 1);
    if (!/^\d+$/.test(fractionPart)) return null;
  }

  // Whatever separator remains in the integer part must be well-formed grouping.
  if (/[.,]/.test(integerPart)) {
    if (!/^\d{1,3}(?:,\d{3})+$/.test(integerPart) && !/^\d{1,3}(?:\.\d{3})+$/.test(integerPart)) return null;
    integerPart = integerPart.replace(/[.,]/g, "");
  }
  if (!/^\d+$/.test(integerPart)) return null;

  return new FinDecimal(fractionPart ? `${integerPart}.${fractionPart}` : integerPart);
}

export type MoneyFormatOptions = {
  locale?: string;
  /** Show ".00" even for whole amounts. Default: only when there are cents. */
  alwaysShowDecimals?: boolean;
  /** Prefix "+" for positive values (e.g. income rows). */
  signed?: boolean;
  /** Omit the currency code. */
  hideCurrency?: boolean;
};

/**
 * Display formatting only — e.g. "113,606,733.37 UZS", "3,500,000 UZS".
 * Uses Intl's exact string formatting, so large values keep every digit.
 */
export function formatMoney(value: MoneyLike, currency: string, options: MoneyFormatOptions = {}): string {
  const amount = roundMoney(value);
  const hasFraction = !amount.isInteger();
  const digits = options.alwaysShowDecimals || hasFraction ? MONEY_SCALE : 0;
  const formatter = new Intl.NumberFormat(options.locale ?? APP_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: options.signed ? "exceptZero" : "auto",
  });
  // Intl.NumberFormat accepts decimal strings exactly (no float conversion).
  const formatted = formatter.format(amount.toFixed(digits) as unknown as number);
  return options.hideCurrency ? formatted : `${formatted} ${currency}`;
}

/** Percentage of `part` in `whole`; null when `whole` is zero (never divides by zero). */
export function percentage(part: MoneyLike, whole: MoneyLike): FinDecimal | null {
  const denominator = money(whole);
  if (denominator.isZero()) return null;
  return money(part).div(denominator).times(100);
}

/** Short display form for axes and dense lists: 12,500,000 → "12.5M". Display only. */
export function formatCompactMoney(value: MoneyLike, locale = APP_LOCALE): string {
  const formatter = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  return formatter.format(roundMoney(value, 0).toFixed(0) as unknown as number);
}
