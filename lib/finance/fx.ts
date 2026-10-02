/**
 * Exchange rates (SPEC §46): the user's own manual rates and the official
 * Central Bank of Uzbekistan rates (lib/finance/cbu.ts). The latest rate on
 * or before a date is used, or the inverse of a rate quoted the other way
 * round; on the same date a manual rate wins. Nothing is invented.
 */
import { daysBetween, type LocalDate } from "./dates";
import { money, sumMoney, type FinDecimal, type MoneyLike } from "./money";

export type RateSource = "MANUAL" | "CBU";
export type RateRow = { fromCurrency: string; toCurrency: string; rate: MoneyLike; effectiveDate: LocalDate; source?: RateSource };

export function findRate(
  rates: readonly RateRow[],
  from: string,
  to: string,
  date: LocalDate,
): { rate: FinDecimal; effectiveDate: LocalDate; inverted: boolean; source: RateSource } | null {
  if (from === to) return { rate: money(1), effectiveDate: date, inverted: false, source: "MANUAL" };
  const candidates = rates
    .filter((r) => daysBetween(r.effectiveDate, date) >= 0)
    .filter((r) => (r.fromCurrency === from && r.toCurrency === to) || (r.fromCurrency === to && r.toCurrency === from))
    // Latest effective date first; on the same date the user's own rate wins.
    .sort((a, b) => daysBetween(a.effectiveDate, b.effectiveDate) || (a.source === "CBU" ? 1 : 0) - (b.source === "CBU" ? 1 : 0));
  const best = candidates[0];
  if (!best) return null;
  const inverted = best.fromCurrency !== from;
  return {
    rate: inverted ? money(1).div(money(best.rate)) : money(best.rate),
    effectiveDate: best.effectiveDate,
    inverted,
    source: best.source ?? "MANUAL",
  };
}

export function convert(amount: MoneyLike, rate: MoneyLike): FinDecimal {
  return money(amount).times(money(rate));
}

/** Sum of per-currency totals in `base`, or null (with the missing currencies) if any rate is absent. */
export function combineInBase(
  totals: readonly { currency: string; amount: MoneyLike }[],
  base: string,
  rates: readonly RateRow[],
  date: LocalDate,
): { total: FinDecimal | null; missing: string[]; oldestRateDate: LocalDate | null } {
  const missing: string[] = [];
  const parts: FinDecimal[] = [];
  let oldest: LocalDate | null = null;
  for (const t of totals) {
    const rate = findRate(rates, t.currency, base, date);
    if (!rate) {
      missing.push(t.currency);
      continue;
    }
    if (t.currency !== base && (!oldest || daysBetween(rate.effectiveDate, oldest) > 0)) oldest = rate.effectiveDate;
    parts.push(convert(t.amount, rate.rate));
  }
  return { total: missing.length ? null : sumMoney(parts), missing, oldestRateDate: oldest };
}

/**
 * `amount` of `from` in `to`, using rates quoted as UZS per 1 unit (the
 * Central Bank's form). Null when a needed rate is missing. Rounded to 2 dp.
 */
export function convertViaUzs(amount: MoneyLike, from: string, to: string, uzsPerUnit: Readonly<Record<string, string>>): FinDecimal | null {
  const rate = (c: string) => (c === "UZS" ? money(1) : uzsPerUnit[c] ? money(uzsPerUnit[c]!) : null);
  const a = rate(from);
  const b = rate(to);
  if (!a || !b || b.isZero()) return null;
  return money(amount).times(a).div(b).toDecimalPlaces(2);
}
