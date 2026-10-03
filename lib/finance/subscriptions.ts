/**
 * Subscription totals (pure). Each subscription keeps its own currency; the
 * combined figure converts per-currency totals at the latest rate (Central
 * Bank or the user's own), like the combined account balance.
 */
import { daysBetween, type LocalDate } from "./dates";
import { combineInBase, type RateRow } from "./fx";
import { money, sumMoney, toMoneyString, type FinDecimal, type MoneyLike } from "./money";
import { monthlyEquivalent, type RecurrenceFrequency } from "./recurrence";

/** Cost per year: monthly × 12, weekly × 52, yearly as is (each divided by the interval). */
export function annualEquivalent(amount: MoneyLike, frequency: RecurrenceFrequency, interval: number): FinDecimal {
  return monthlyEquivalent(amount, frequency, interval).times(12);
}

export type SubscriptionLike = {
  id: string;
  name: string;
  amount: string;
  currency: string;
  frequency: RecurrenceFrequency;
  interval: number;
  isActive: boolean;
  nextOccurrence: LocalDate | null;
};

export type SubscriptionSummary = {
  activeCount: number;
  /** Per currency, rounded to 2 dp; primary currency first. */
  byCurrency: { currency: string; monthly: string; yearly: string }[];
  /** Everything in the primary currency, or null when a rate is missing. */
  combined: { monthly: string; yearly: string; rateDate: LocalDate | null } | null;
  /** Earliest upcoming charges (all on the same soonest date). */
  next: { date: LocalDate; items: { id: string; name: string; amount: string; currency: string }[] } | null;
};

export function summarizeSubscriptions(items: readonly SubscriptionLike[], base: string, rates: readonly RateRow[], today: LocalDate): SubscriptionSummary {
  const active = items.filter((i) => i.isActive);
  const monthly = new Map<string, FinDecimal[]>();
  for (const i of active) monthly.set(i.currency, [...(monthly.get(i.currency) ?? []), monthlyEquivalent(i.amount, i.frequency, i.interval)]);

  const currencies = [...monthly.keys()].sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
  const totals = currencies.map((currency) => ({ currency, monthly: sumMoney(monthly.get(currency)!) }));
  const byCurrency = totals.map((t) => ({ currency: t.currency, monthly: toMoneyString(t.monthly), yearly: toMoneyString(t.monthly.times(12)) }));

  let combined: SubscriptionSummary["combined"] = null;
  if (totals.length) {
    const c = combineInBase(totals.map((t) => ({ currency: t.currency, amount: t.monthly })), base, rates, today);
    if (c.total) combined = { monthly: toMoneyString(c.total), yearly: toMoneyString(c.total.times(12)), rateDate: c.oldestRateDate };
  }

  const upcoming = active.filter((i): i is SubscriptionLike & { nextOccurrence: LocalDate } => i.nextOccurrence !== null && daysBetween(today, i.nextOccurrence) >= 0);
  let next: SubscriptionSummary["next"] = null;
  if (upcoming.length) {
    const date = upcoming.reduce((min, i) => (daysBetween(i.nextOccurrence, min) > 0 ? i.nextOccurrence : min), upcoming[0]!.nextOccurrence);
    next = {
      date,
      items: upcoming.filter((i) => i.nextOccurrence === date).map((i) => ({ id: i.id, name: i.name, amount: money(i.amount).toFixed(2), currency: i.currency })),
    };
  }
  return { activeCount: active.length, byCurrency, combined, next };
}

/** Active first, then by next charge date (soonest first), then by name. */
export function sortSubscriptions<T extends SubscriptionLike>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.nextOccurrence && b.nextOccurrence && a.nextOccurrence !== b.nextOccurrence) return a.nextOccurrence.localeCompare(b.nextOccurrence);
    if (!a.nextOccurrence !== !b.nextOccurrence) return a.nextOccurrence ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });
}

export type PurchaseRow = { date: LocalDate; amount: string; currency: string; merchant: string | null; accountId: string };

export type PurchaseSummary = {
  count: number;
  /** Per currency, primary currency first. */
  byCurrency: { currency: string; total: string }[];
  combined: { total: string; rateDate: LocalDate | null } | null;
  last: PurchaseRow | null;
  /** Account used most often (latest wins a tie), to preselect for the next purchase. */
  usualAccountId: string | null;
};

/** One-off purchases of a kind (e.g. travel eSIMs): how many, how much, the latest one. */
export function summarizePurchases(rows: readonly PurchaseRow[], base: string, rates: readonly RateRow[], today: LocalDate): PurchaseSummary {
  const sums = new Map<string, FinDecimal[]>();
  for (const r of rows) sums.set(r.currency, [...(sums.get(r.currency) ?? []), money(r.amount)]);
  const currencies = [...sums.keys()].sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
  const totals = currencies.map((currency) => ({ currency, amount: sumMoney(sums.get(currency)!) }));

  let combined: PurchaseSummary["combined"] = null;
  if (totals.length) {
    const c = combineInBase(totals, base, rates, today);
    if (c.total) combined = { total: toMoneyString(c.total), rateDate: c.oldestRateDate };
  }
  const latestFirst = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const uses = new Map<string, number>();
  for (const r of latestFirst) uses.set(r.accountId, (uses.get(r.accountId) ?? 0) + 1);
  let usualAccountId: string | null = null;
  for (const [id, n] of uses) if (usualAccountId === null || n > uses.get(usualAccountId)!) usualAccountId = id;

  return {
    count: rows.length,
    byCurrency: totals.map((t) => ({ currency: t.currency, total: toMoneyString(t.amount) })),
    combined,
    last: latestFirst[0] ?? null,
    usualAccountId,
  };
}
