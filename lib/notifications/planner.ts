/**
 * Reminder planner (docs/telegram.md §3). Pure: given the user's open
 * schedule lines, preferences and local "today", returns the reminders that
 * should exist right now, each with a deduplication key. The dispatcher
 * claims keys before sending, so planning the same day twice is harmless.
 */
import { daysBetween, type LocalDate } from "@/lib/finance/dates";

export type ReminderType = "DUE_IN_DAYS" | "DUE_TODAY" | "OVERDUE";

export type PlannerItem = {
  itemId: string;
  debtId: string;
  debtName: string;
  debtType: string;
  currency: string;
  dueDate: LocalDate;
  /** What is still owed on this line (planned − paid). */
  amountDue: string;
  remainingPrincipal: string;
};

export type PlannerPreferences = {
  notifyDaysBefore: number[];
  notifyOnDueDate: boolean;
  notifyWhenOverdue: boolean;
  overdueRepeatDays: number;
};

export const DEFAULT_PREFERENCES: PlannerPreferences = {
  notifyDaysBefore: [7, 3, 1],
  notifyOnDueDate: true,
  notifyWhenOverdue: true,
  overdueRepeatDays: 3,
};

export type ReminderIntent = {
  type: ReminderType;
  item: PlannerItem;
  /** Days until due (DUE_IN_DAYS) or days overdue (OVERDUE); 0 for DUE_TODAY. */
  days: number;
  deduplicationKey: string;
};

const CHANNEL_SUFFIX = "tg";
const TYPE_ORDER: Record<ReminderType, number> = { OVERDUE: 0, DUE_TODAY: 1, DUE_IN_DAYS: 2 };

/** Longest look-ahead any preference can ask for; bounds the item query. */
export const MAX_DAYS_BEFORE = 30;

function planOne(item: PlannerItem, prefs: PlannerPreferences, today: LocalDate): ReminderIntent | null {
  const until = daysBetween(today, item.dueDate);
  if (until > 0) {
    // The window for threshold n is (next smaller threshold, n]. A day the
    // job did not run still gets its reminder later in the same window, and
    // the shared key keeps it to one message per window.
    const threshold = [...prefs.notifyDaysBefore].sort((a, b) => a - b).find((n) => n >= until);
    if (threshold === undefined) return null;
    return { type: "DUE_IN_DAYS", item, days: until, deduplicationKey: `due:${item.itemId}:${item.dueDate}:d${threshold}:${CHANNEL_SUFFIX}` };
  }
  if (until === 0) {
    if (!prefs.notifyOnDueDate) return null;
    return { type: "DUE_TODAY", item, days: 0, deduplicationKey: `today:${item.itemId}:${item.dueDate}:${CHANNEL_SUFFIX}` };
  }
  if (!prefs.notifyWhenOverdue) return null;
  const overdue = -until;
  // Day 1 opens round 0; every `overdueRepeatDays` opens the next round.
  const round = Math.floor((overdue - 1) / Math.max(1, prefs.overdueRepeatDays));
  return { type: "OVERDUE", item, days: overdue, deduplicationKey: `overdue:${item.itemId}:${item.dueDate}:r${round}:${CHANNEL_SUFFIX}` };
}

/** Reminders due now, most urgent first (overdue, due today, then soonest). */
export function planReminders(items: PlannerItem[], prefs: PlannerPreferences, today: LocalDate): ReminderIntent[] {
  return items
    .map((item) => planOne(item, prefs, today))
    .filter((i): i is ReminderIntent => i !== null)
    .sort(
      (a, b) =>
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
        daysBetween(b.item.dueDate, a.item.dueDate) ||
        a.item.debtName.localeCompare(b.item.debtName),
    );
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutes(value: string): number {
  const match = HHMM.exec(value);
  if (!match) throw new RangeError(`Invalid time "${value}", expected HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTime(value: string): boolean {
  return HHMM.test(value);
}

/** Is `now` ("HH:MM") inside [start, end)? The window may wrap midnight; equal ends mean no window. */
export function isQuietTime(now: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const t = minutes(now);
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Wall-clock "HH:MM" in an IANA time zone. */
export function localTimeIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}
