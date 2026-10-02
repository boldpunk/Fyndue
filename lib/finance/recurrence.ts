/**
 * Recurring rules → occurrence dates (Phase 4). Pure. Monthly and yearly
 * rules keep the start date's day, clamped to short months (31 Jan →
 * 28/29 Feb → 31 Mar).
 */
import { addDays, addMonthsClamped, daysBetween, parseLocalDate, type LocalDate } from "./dates";
import { money, type FinDecimal, type MoneyLike } from "./money";

export type RecurrenceFrequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: LocalDate;
  endDate?: LocalDate | null;
};

const MAX_OCCURRENCES = 2000;

function nth(rule: RecurrenceRule, k: number): LocalDate {
  const step = Math.max(1, rule.interval);
  if (rule.frequency === "WEEKLY") return addDays(rule.startDate, 7 * step * k);
  const day = parseLocalDate(rule.startDate).day;
  const months = rule.frequency === "MONTHLY" ? step * k : 12 * step * k;
  return addMonthsClamped(rule.startDate, months, day);
}

/** Index of the first occurrence that could fall on or after `date` (never overshoots). */
function firstIndexNear(rule: RecurrenceRule, date: LocalDate): number {
  const days = daysBetween(rule.startDate, date);
  if (days <= 0) return 0;
  const step = Math.max(1, rule.interval);
  const periodDays = rule.frequency === "WEEKLY" ? 7 * step : rule.frequency === "MONTHLY" ? 28 * step : 365 * step;
  return Math.max(0, Math.floor(days / periodDays) - 2);
}

/** Occurrences in [from, to], both inclusive. */
export function occurrencesBetween(rule: RecurrenceRule, from: LocalDate, to: LocalDate): LocalDate[] {
  const result: LocalDate[] = [];
  for (let k = firstIndexNear(rule, from), guard = 0; guard < MAX_OCCURRENCES; k++, guard++) {
    const date = nth(rule, k);
    if (daysBetween(date, to) < 0) break;
    if (rule.endDate && daysBetween(date, rule.endDate) < 0) break;
    if (daysBetween(from, date) >= 0) result.push(date);
  }
  return result;
}

/** First occurrence on or after `date`, or null if the rule has ended. */
export function nextOccurrence(rule: RecurrenceRule, date: LocalDate): LocalDate | null {
  for (let k = firstIndexNear(rule, date), guard = 0; guard < MAX_OCCURRENCES; k++, guard++) {
    const candidate = nth(rule, k);
    if (rule.endDate && daysBetween(candidate, rule.endDate) < 0) return null;
    if (daysBetween(date, candidate) >= 0) return candidate;
  }
  return null;
}

/** Russian plural forms: [1, 2–4, 5+] (неделя, недели, недель). */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

const EVERY: Record<RecurrenceFrequency, { one: string; forms: [string, string, string]; prefix: [string, string] }> = {
  WEEKLY: { one: "Каждую неделю", forms: ["неделю", "недели", "недель"], prefix: ["Каждую", "Каждые"] },
  MONTHLY: { one: "Каждый месяц", forms: ["месяц", "месяца", "месяцев"], prefix: ["Каждый", "Каждые"] },
  YEARLY: { one: "Каждый год", forms: ["год", "года", "лет"], prefix: ["Каждый", "Каждые"] },
};

/** "Каждый месяц", "Каждые 2 недели", "Каждые 5 лет", "Каждый 21 месяц". */
export function describeRule(rule: Pick<RecurrenceRule, "frequency" | "interval">): string {
  const e = EVERY[rule.frequency];
  if (rule.interval === 1) return e.one;
  const n = rule.interval;
  const singular = n % 10 === 1 && n % 100 !== 11;
  return `${singular ? e.prefix[0] : e.prefix[1]} ${n} ${pluralRu(n, e.forms)}`;
}

/** Average cost per month (weekly × 52 / 12, yearly / 12), unrounded except for display. */
export function monthlyEquivalent(amount: MoneyLike, frequency: RecurrenceFrequency, interval: number): FinDecimal {
  const base = money(amount).div(Math.max(1, interval));
  if (frequency === "WEEKLY") return base.times(52).div(12);
  if (frequency === "YEARLY") return base.div(12);
  return base;
}
