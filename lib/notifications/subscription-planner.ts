/**
 * Subscription charge reminders (pure). Given the next unrecorded charge of
 * each active subscription, the user's preference and local "today",
 * returns the reminders that should exist now, each with a deduplication
 * key, like the debt planner. Subscriptions are charged automatically, so
 * there are no overdue reminders: once the day has passed, it is over.
 */
import { daysBetween, type LocalDate } from "@/lib/finance/dates";

export type SubscriptionReminderItem = {
  recurringId: string;
  name: string;
  amount: string;
  currency: string;
  chargeDate: LocalDate;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  accountName: string;
  /** Current balance of the card it is charged to (same currency as `amount`). */
  accountBalance: string;
  url: string | null;
};

export type SubscriptionReminderPreferences = {
  subscriptionReminders: boolean;
  /** 0 = on the day of the charge. */
  subscriptionDaysBefore: number;
};

export const DEFAULT_SUBSCRIPTION_PREFERENCES: SubscriptionReminderPreferences = { subscriptionReminders: true, subscriptionDaysBefore: 1 };

/** Yearly renewals are also announced this many days ahead, to leave time to cancel. */
export const YEARLY_NOTICE_DAYS = 7;

export type SubscriptionIntent = {
  kind: "SUBSCRIPTION";
  type: "SUBSCRIPTION_CHARGE";
  item: SubscriptionReminderItem;
  /** Days until the charge (0 = today). */
  days: number;
  deduplicationKey: string;
};

function planOne(item: SubscriptionReminderItem, prefs: SubscriptionReminderPreferences, today: LocalDate): SubscriptionIntent | null {
  const until = daysBetween(today, item.chargeDate);
  if (until < 0) return null;
  const thresholds = [prefs.subscriptionDaysBefore, ...(item.frequency === "YEARLY" ? [YEARLY_NOTICE_DAYS] : [])];
  // Same windows as debt reminders: (next smaller threshold, n] share one key, so a missed day still gets its message once.
  const threshold = [...new Set(thresholds)].sort((a, b) => a - b).find((n) => n >= until);
  if (threshold === undefined) return null;
  return {
    kind: "SUBSCRIPTION",
    type: "SUBSCRIPTION_CHARGE",
    item,
    days: until,
    deduplicationKey: `sub:${item.recurringId}:${item.chargeDate}:d${threshold}:tg`,
  };
}

/** Reminders due now, soonest charge first. */
export function planSubscriptionReminders(items: readonly SubscriptionReminderItem[], prefs: SubscriptionReminderPreferences, today: LocalDate): SubscriptionIntent[] {
  if (!prefs.subscriptionReminders) return [];
  return items
    .map((item) => planOne(item, prefs, today))
    .filter((i): i is SubscriptionIntent => i !== null)
    .sort((a, b) => a.days - b.days || a.item.name.localeCompare(b.item.name, "ru"));
}
