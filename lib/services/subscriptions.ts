import "server-only";
import { prisma } from "@/lib/db";
import { addDays, daysBetween, dbToLocalDate, localDateToDb, todayIn, type LocalDate } from "@/lib/finance/dates";
import { convert, findRate } from "@/lib/finance/fx";
import { toMoneyString } from "@/lib/finance/money";
import { nextOccurrence } from "@/lib/finance/recurrence";
import { sortSubscriptions, summarizeSubscriptions, type SubscriptionSummary } from "@/lib/finance/subscriptions";
import { ratesForUser } from "./central-bank-rates";
import { listOccurrences, listRecurring, type Occurrence, type RecurringDTO } from "./recurring";

/** How far back the page looks for charges that were not recorded yet. */
export const PENDING_LOOKBACK_DAYS = 31;

export type SubscriptionDTO = RecurringDTO & {
  /** One charge in the primary currency at the latest rate; null for the primary currency or without a rate. */
  amountInBase: string | null;
};

export type SubscriptionsPage = {
  today: LocalDate;
  baseCurrency: string;
  items: SubscriptionDTO[];
  /** Charges on or before today that have no transaction yet, oldest first. */
  pending: Occurrence[];
  summary: SubscriptionSummary;
};

export async function getSubscriptions(userId: string): Promise<SubscriptionsPage> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, baseCurrency: true } });
  const today = todayIn(user.timezone);
  const base = user.baseCurrency;
  const [all, rates] = await Promise.all([listRecurring(userId), ratesForUser(userId)]);
  const subs = all.filter((r) => r.isSubscription);

  // Charges before a subscription was added are already in the opening balance; only later ones wait to be recorded.
  const added = new Map(
    (await prisma.recurringTransaction.findMany({ where: { userId, id: { in: subs.map((s) => s.id) } }, select: { id: true, createdAt: true } })).map((r) => [
      r.id,
      todayIn(user.timezone, r.createdAt),
    ]),
  );
  const pending = subs.length
    ? (await listOccurrences(userId, addDays(today, -PENDING_LOOKBACK_DAYS), today)).filter(
        (o) => o.isSubscription && o.transactionId === null && daysBetween(added.get(o.recurringId) ?? today, o.date) >= 0,
      )
    : [];

  // A charge already recorded (e.g. paid today or early) is done: the next one is the following period's.
  const recorded = new Set(
    (
      await prisma.transaction.findMany({
        where: { userId, voidedAt: null, recurringId: { in: subs.map((s) => s.id) }, occurrenceDate: { gte: localDateToDb(today) } },
        select: { recurringId: true, occurrenceDate: true },
      })
    ).map((t) => `${t.recurringId}|${dbToLocalDate(t.occurrenceDate!)}`),
  );
  const upcoming = (s: RecurringDTO): LocalDate | null => {
    let next = s.nextOccurrence;
    for (let guard = 0; next && recorded.has(`${s.id}|${next}`) && guard < 24; guard++) next = nextOccurrence(s, addDays(next, 1));
    return next;
  };

  const items = sortSubscriptions(
    subs.map((s) => ({ ...s, nextOccurrence: upcoming(s) })).map((s) => {
      const rate = s.currency === base ? null : findRate(rates, s.currency, base, today);
      return { ...s, amountInBase: rate ? toMoneyString(convert(s.amount, rate.rate)) : null };
    }),
  );
  return { today, baseCurrency: base, items, pending, summary: summarizeSubscriptions(items, base, rates, today) };
}
