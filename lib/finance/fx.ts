/**
 * Manual exchange rates (SPEC §46). Rates are only ever what the user
 * entered: the latest one on or before a date, or the inverse of a rate
 * entered the other way round. Nothing is fetched or invented.
 */
import { daysBetween, type LocalDate } from "./dates";
import { money, sumMoney, type FinDecimal, type MoneyLike } from "./money";

export type RateRow = { fromCurrency: string; toCurrency: string; rate: MoneyLike; effectiveDate: LocalDate };

export function findRate(
  rates: readonly RateRow[],
  from: string,
  to: string,
  date: LocalDate,
): { rate: FinDecimal; effectiveDate: LocalDate; inverted: boolean } | null {
  if (from === to) return { rate: money(1), effectiveDate: date, inverted: false };
  const candidates = rates
    .filter((r) => daysBetween(r.effectiveDate, date) >= 0)
    .filter((r) => (r.fromCurrency === from && r.toCurrency === to) || (r.fromCurrency === to && r.toCurrency === from))
    // Latest effective date first.
    .sort((a, b) => daysBetween(a.effectiveDate, b.effectiveDate));
  const best = candidates[0];
  if (!best) return null;
  const inverted = best.fromCurrency !== from;
  return { rate: inverted ? money(1).div(money(best.rate)) : money(best.rate), effectiveDate: best.effectiveDate, inverted };
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
