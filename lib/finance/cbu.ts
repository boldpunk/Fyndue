/**
 * Official daily rates of the Central Bank of Uzbekistan (cbu.uz). Pure
 * parsing only: a row is kept when every field is well-formed, otherwise it
 * is dropped — a rate is never guessed (SPEC §46).
 *
 *   GET https://cbu.uz/ru/arkhiv-kursov-valyut/json/
 *   [{ "Ccy": "USD", "Nominal": "1", "Rate": "11808.76", "Date": "01.10.2026", … }, …]
 *
 * `Rate` is UZS per `Nominal` units; the result is UZS per 1 unit.
 */
import { makeLocalDate, isLocalDate, type LocalDate } from "./dates";
import { money, toMoneyString } from "./money";

/** Currencies Fyndue accounts can hold, other than UZS itself. */
export const CBU_CURRENCIES = ["USD", "EUR", "RUB"] as const;
export type CbuCurrency = (typeof CBU_CURRENCIES)[number];

export type CbuRate = { currency: CbuCurrency; rate: string; rateDate: LocalDate };

export const CBU_RATES_URL = "https://cbu.uz/ru/arkhiv-kursov-valyut/json/";

const NUMBER = /^\d{1,12}(\.\d{1,8})?$/;

export function parseCbuRates(payload: unknown): CbuRate[] {
  if (!Array.isArray(payload)) return [];
  const out: CbuRate[] = [];
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const { Ccy, Nominal, Rate, Date: date } = row as Record<string, unknown>;
    if (typeof Ccy !== "string" || !(CBU_CURRENCIES as readonly string[]).includes(Ccy)) continue;
    if (typeof Rate !== "string" || !NUMBER.test(Rate)) continue;
    if (typeof Nominal !== "string" || !/^\d{1,6}$/.test(Nominal) || Number(Nominal) === 0) continue;
    const m = typeof date === "string" ? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date) : null;
    if (!m) continue;
    const rateDate = makeLocalDate(Number(m[3]), Number(m[2]), Number(m[1]));
    if (!isLocalDate(rateDate)) continue;
    const perUnit = money(Rate).div(money(Nominal));
    if (perUnit.lte(0)) continue;
    out.push({ currency: Ccy as CbuCurrency, rate: toMoneyString(perUnit, 8).replace(/\.?0+$/, ""), rateDate });
  }
  return out;
}
