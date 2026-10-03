import "server-only";
import { prisma } from "@/lib/db";
import { addDays, daysBetween, dbToLocalDate, localDateToDb, todayIn, type LocalDate } from "@/lib/finance/dates";
import { convert, findRate } from "@/lib/finance/fx";
import { toMoneyString } from "@/lib/finance/money";
import { nextOccurrence } from "@/lib/finance/recurrence";
import { ESIM_CATEGORY_NAME } from "@/lib/constants/categories";
import { sortSubscriptions, summarizePurchases, summarizeSubscriptions, type PurchaseSummary, type SubscriptionSummary } from "@/lib/finance/subscriptions";
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
  /** Travel eSIMs bought in the last 12 months (the «eSIM и роуминг» category); null if the category was removed. */
  esim: (PurchaseSummary & { categoryId: string }) | null;
};

/** The window the eSIM card sums over. */
export const ESIM_WINDOW_DAYS = 365;

async function esimPurchases(userId: string, today: LocalDate, base: string, rates: Awaited<ReturnType<typeof ratesForUser>>) {
  const category = await prisma.category.findFirst({ where: { userId, type: "EXPENSE", name: ESIM_CATEGORY_NAME, isArchived: false }, select: { id: true } });
  if (!category) return null;
  const rows = await prisma.transaction.findMany({
    where: { userId, categoryId: category.id, type: "EXPENSE", voidedAt: null, status: "ACTUAL", transactionDate: { gte: localDateToDb(addDays(today, -ESIM_WINDOW_DAYS)), lte: localDateToDb(today) } },
    select: { transactionDate: true, amount: true, currency: true, merchant: true, accountId: true },
  });
  const purchases = rows.map((r) => ({ date: dbToLocalDate(r.transactionDate), amount: toMoneyString(r.amount), currency: r.currency, merchant: r.merchant, accountId: r.accountId }));
  return { categoryId: category.id, ...summarizePurchases(purchases, base, rates, today) };
}

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
  return { today, baseCurrency: base, items, pending, summary: summarizeSubscriptions(items, base, rates, today), esim: await esimPurchases(userId, today, base, rates) };
}
