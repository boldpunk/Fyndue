import "server-only";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { addDays, dbToLocalDate, localDateToDb, todayIn } from "@/lib/finance/dates";
import { money, toMoneyString } from "@/lib/finance/money";
import type { NotificationPreference } from "@/lib/generated/prisma/client";
import {
  DEFAULT_PREFERENCES,
  isQuietTime,
  localTimeIn,
  MAX_DAYS_BEFORE,
  planReminders,
  type PlannerItem,
} from "@/lib/notifications/planner";
import {
  DEFAULT_SUBSCRIPTION_PREFERENCES,
  planSubscriptionReminders,
  YEARLY_NOTICE_DAYS,
  type SubscriptionReminderItem,
} from "@/lib/notifications/subscription-planner";
import { occurrencesBetween } from "@/lib/finance/recurrence";
import { TelegramApiError, type TelegramSender } from "@/lib/telegram/client";
import { formatDigest, isSubscriptionIntent, type AnyReminderIntent } from "@/lib/telegram/messages";
import type { NotificationPreferencesInput } from "@/lib/validations/notifications";
import { writeAudit } from "./audit";
import { disconnectChat } from "./telegram-connection";

// ─── Preferences ──────────────────────────────────────────────────────────────

export type NotificationPreferencesDTO = {
  telegramEnabled: boolean;
  notifyDaysBefore: number[];
  notifyOnDueDate: boolean;
  notifyWhenOverdue: boolean;
  overdueRepeatDays: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  subscriptionReminders: boolean;
  subscriptionDaysBefore: number;
};

const DEFAULT_QUIET = { start: "22:00", end: "09:00" };

function toPrefsDTO(row: NotificationPreference | null): NotificationPreferencesDTO {
  return {
    telegramEnabled: row?.telegramEnabled ?? true,
    notifyDaysBefore: row?.notifyDaysBefore ?? DEFAULT_PREFERENCES.notifyDaysBefore,
    notifyOnDueDate: row?.notifyOnDueDate ?? DEFAULT_PREFERENCES.notifyOnDueDate,
    notifyWhenOverdue: row?.notifyWhenOverdue ?? DEFAULT_PREFERENCES.notifyWhenOverdue,
    overdueRepeatDays: row?.overdueRepeatDays ?? DEFAULT_PREFERENCES.overdueRepeatDays,
    quietHoursEnabled: row ? Boolean(row.quietHoursStart && row.quietHoursEnd) : true,
    quietHoursStart: row?.quietHoursStart ?? DEFAULT_QUIET.start,
    quietHoursEnd: row?.quietHoursEnd ?? DEFAULT_QUIET.end,
    subscriptionReminders: row?.subscriptionReminders ?? DEFAULT_SUBSCRIPTION_PREFERENCES.subscriptionReminders,
    subscriptionDaysBefore: row?.subscriptionDaysBefore ?? DEFAULT_SUBSCRIPTION_PREFERENCES.subscriptionDaysBefore,
  };
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferencesDTO> {
  return toPrefsDTO(await prisma.notificationPreference.findUnique({ where: { userId } }));
}

export async function updateNotificationPreferences(userId: string, input: NotificationPreferencesInput): Promise<void> {
  const data = {
    telegramEnabled: input.telegramEnabled,
    notifyDaysBefore: input.notifyDaysBefore,
    notifyOnDueDate: input.notifyOnDueDate,
    notifyWhenOverdue: input.notifyWhenOverdue,
    overdueRepeatDays: input.overdueRepeatDays,
    quietHoursStart: input.quietHoursEnabled ? input.quietHoursStart : null,
    quietHoursEnd: input.quietHoursEnabled ? input.quietHoursEnd : null,
    subscriptionReminders: input.subscriptionReminders,
    subscriptionDaysBefore: input.subscriptionDaysBefore,
  };
  await prisma.$transaction(async (tx) => {
    const row = await tx.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    await writeAudit(tx, { userId, action: "NOTIFICATION_PREFERENCES_UPDATED", entityType: "NotificationPreference", entityId: row.id, metadata: data });
  });
}

// ─── Dispatcher (docs/telegram.md §4) ────────────────────────────────────────

/** Reminders per message; the rest wait for the next run (one message per user per run). */
export const MAX_REMINDERS_PER_MESSAGE = 8;
export const MAX_ATTEMPTS = 5;
/** A PENDING row this old was claimed by a run that crashed before sending. */
const STALE_PENDING_MS = 10 * 60 * 1000;
/** ≤ 25 messages/second across all chats (Telegram allows ~30). */
const MIN_SEND_INTERVAL_MS = 40;

function retryDelayMs(attempts: number): number {
  return Math.min(60, 2 ** attempts) * 60 * 1000;
}

type Clock = { now: Date };

/**
 * Claims a reminder by inserting its unique key (ON CONFLICT DO NOTHING).
 * Exactly one concurrent run can win the insert. An existing row is
 * re-claimed only when it failed (with backoff), was cancelled but is due
 * again, or was left PENDING by a crashed run; each re-claim is a
 * compare-and-set on updatedAt so it too has a single winner.
 */
async function claim(userId: string, intent: AnyReminderIntent, { now }: Clock): Promise<boolean> {
  const key = intent.deduplicationKey;
  const { count } = await prisma.notificationLog.createMany({
    data: [
      {
        userId,
        ...(isSubscriptionIntent(intent) ? { recurringId: intent.item.recurringId } : { debtId: intent.item.debtId, scheduleItemId: intent.item.itemId }),
        type: intent.type,
        channel: "TELEGRAM",
        deduplicationKey: key,
        scheduledAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    skipDuplicates: true,
  });
  if (count === 1) return true;

  const row = await prisma.notificationLog.findUnique({ where: { deduplicationKey: key } });
  if (!row || row.userId !== userId) return false;
  const age = now.getTime() - row.updatedAt.getTime();
  const reclaimable =
    (row.status === "FAILED" && row.attempts < MAX_ATTEMPTS && age >= retryDelayMs(row.attempts)) ||
    row.status === "CANCELLED" ||
    (row.status === "PENDING" && age >= STALE_PENDING_MS);
  if (!reclaimable) return false;
  const taken = await prisma.notificationLog.updateMany({
    where: { id: row.id, status: row.status, updatedAt: row.updatedAt },
    data: { status: "PENDING", scheduledAt: now, updatedAt: now, ...(row.status === "CANCELLED" ? { attempts: 0, failureReason: null } : {}) },
  });
  return taken.count === 1;
}

async function openItemsFor(userId: string, today: string): Promise<PlannerItem[]> {
  const items = await prisma.debtScheduleItem.findMany({
    where: {
      userId,
      isCurrent: true,
      status: { in: ["SCHEDULED", "PARTIALLY_PAID"] },
      dueDate: { lte: localDateToDb(addDays(today, MAX_DAYS_BEFORE)) },
      debt: { status: "ACTIVE" },
    },
    include: { debt: { select: { name: true, type: true, currency: true, currentPrincipal: true } } },
  });
  return items
    .map((i) => ({
      itemId: i.id,
      debtId: i.debtId,
      debtName: i.debt.name,
      debtType: i.debt.type,
      currency: i.debt.currency,
      dueDate: dbToLocalDate(i.dueDate),
      amountDue: toMoneyString(money(i.plannedTotal).minus(money(i.paidTotal))),
      remainingPrincipal: toMoneyString(i.debt.currentPrincipal),
    }))
    .filter((i) => money(i.amountDue).gt(0));
}

/** Each active subscription's next charge in the reminder window that has not been recorded yet. */
async function subscriptionItemsFor(userId: string, today: string): Promise<SubscriptionReminderItem[]> {
  const horizon = addDays(today, YEARLY_NOTICE_DAYS);
  const rules = await prisma.recurringTransaction.findMany({
    where: { userId, isSubscription: true, isActive: true, kind: "EXPENSE", startDate: { lte: localDateToDb(horizon) } },
    include: { account: { select: { name: true, currentBalance: true } } },
  });
  if (rules.length === 0) return [];
  const recorded = await prisma.transaction.findMany({
    where: { userId, voidedAt: null, recurringId: { in: rules.map((r) => r.id) }, occurrenceDate: { gte: localDateToDb(today), lte: localDateToDb(horizon) } },
    select: { recurringId: true, occurrenceDate: true },
  });
  const done = new Set(recorded.map((t) => `${t.recurringId}|${dbToLocalDate(t.occurrenceDate!)}`));
  return rules.flatMap((r) => {
    const rule = { frequency: r.frequency, interval: r.interval, startDate: dbToLocalDate(r.startDate), endDate: r.endDate ? dbToLocalDate(r.endDate) : null };
    const next = occurrencesBetween(rule, today, horizon).find((d) => !done.has(`${r.id}|${d}`));
    if (!next) return [];
    return [
      {
        recurringId: r.id,
        name: r.name,
        amount: toMoneyString(r.amount),
        currency: r.currency,
        chargeDate: next,
        frequency: r.frequency,
        accountName: r.account.name,
        accountBalance: toMoneyString(r.account.currentBalance),
        url: r.url,
      },
    ];
  });
}

function failureReason(error: unknown): string {
  // TelegramApiError messages never contain the token; anything else is reduced to its type.
  if (error instanceof TelegramApiError) return error.message.slice(0, 300);
  return error instanceof Error ? `Непредвиденная ошибка: ${error.name}` : "Непредвиденная ошибка";
}

export type RunSummary = { users: number; sent: number; failed: number; deferred: number; cancelled: number };

export type RunOptions = {
  sender: TelegramSender;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One reminder run over every connected user. Safe to run concurrently and
 * repeatedly: a reminder is sent only by the run that claimed its key.
 */
export async function runReminders({ sender, now = new Date(), sleep = realSleep }: RunOptions): Promise<RunSummary> {
  const summary: RunSummary = { users: 0, sent: 0, failed: 0, deferred: 0, cancelled: 0 };
  const connections = await prisma.telegramConnection.findMany({
    where: { status: "CONNECTED", telegramChatId: { not: null } },
    select: { userId: true, telegramChatId: true, user: { select: { timezone: true, notificationPreference: true } } },
    orderBy: { connectedAt: "asc" },
  });
  let lastSend = 0;

  for (const connection of connections) {
    summary.users++;
    const { userId } = connection;
    const chatId = connection.telegramChatId!;
    const prefs = toPrefsDTO(connection.user.notificationPreference);
    const today = todayIn(connection.user.timezone, now);
    // Debts first (they can be overdue), then subscriptions; one digest message for both.
    const intents: AnyReminderIntent[] = prefs.telegramEnabled
      ? [...planReminders(await openItemsFor(userId, today), prefs, today), ...planSubscriptionReminders(await subscriptionItemsFor(userId, today), prefs, today)]
      : [];

    // Anything not planned any more (paid, rescheduled, superseded, archived,
    // or reminders switched off) is cancelled rather than retried.
    const cancelled = await prisma.notificationLog.updateMany({
      where: {
        userId,
        channel: "TELEGRAM",
        // Test messages and Pro notices are not part of the reminder plan.
        type: { notIn: ["TEST", "PRO_EXPIRY"] },
        status: { in: ["PENDING", "FAILED"] },
        deduplicationKey: { notIn: intents.map((i) => i.deduplicationKey) },
      },
      data: { status: "CANCELLED", updatedAt: now },
    });
    summary.cancelled += cancelled.count;
    if (intents.length === 0) continue;

    if (prefs.quietHoursEnabled && isQuietTime(localTimeIn(connection.user.timezone, now), prefs.quietHoursStart, prefs.quietHoursEnd)) {
      summary.deferred += intents.length; // the same keys are claimed by a run after quiet hours
      continue;
    }

    const owned: AnyReminderIntent[] = [];
    for (const intent of intents) {
      if (owned.length >= MAX_REMINDERS_PER_MESSAGE) break;
      if (await claim(userId, intent, { now })) owned.push(intent);
    }
    if (owned.length === 0) continue;
    const keys = owned.map((i) => i.deduplicationKey);

    const wait = lastSend + MIN_SEND_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastSend = Date.now();
    try {
      const { messageId } = await sender.sendMessage(chatId, formatDigest(owned, today));
      await prisma.notificationLog.updateMany({
        where: { deduplicationKey: { in: keys } },
        data: { status: "SENT", sentAt: now, externalMessageId: messageId, attempts: { increment: 1 }, failureReason: null, updatedAt: now },
      });
      summary.sent += owned.length;
    } catch (error) {
      await prisma.notificationLog.updateMany({
        where: { deduplicationKey: { in: keys } },
        data: { status: "FAILED", attempts: { increment: 1 }, failureReason: failureReason(error), updatedAt: now },
      });
      summary.failed += owned.length;
      if (error instanceof TelegramApiError && error.isBlocked) await disconnectChat(chatId);
      if (error instanceof TelegramApiError && error.retryAfter) await sleep(Math.min(error.retryAfter, 30) * 1000);
    }
  }
  return summary;
}

/** "Send test message" in Settings; at most one per minute. */
export async function sendTestNotification(userId: string, sender: TelegramSender, now: Date = new Date()): Promise<void> {
  const connection = await prisma.telegramConnection.findUnique({ where: { userId } });
  if (!connection || connection.status !== "CONNECTED" || !connection.telegramChatId) {
    throw new DomainError("Сначала подключите Telegram.");
  }
  const key = `test:${userId}:${Math.floor(now.getTime() / 60_000)}:tg`;
  const { count } = await prisma.notificationLog.createMany({
    data: [{ userId, type: "TEST", channel: "TELEGRAM", deduplicationKey: key, scheduledAt: now, createdAt: now, updatedAt: now }],
    skipDuplicates: true,
  });
  if (count !== 1) throw new DomainError("Тестовое сообщение только что отправлено. Попробуйте через минуту.");
  try {
    const { messageId } = await sender.sendMessage(
      connection.telegramChatId,
      "✅ <b>Fyndue подключён</b>\n\nНапоминания о платежах будут приходить в этот чат. Отправьте /help, чтобы узнать, что я умею.",
    );
    await prisma.notificationLog.update({
      where: { deduplicationKey: key },
      data: { status: "SENT", sentAt: now, externalMessageId: messageId, attempts: 1, updatedAt: now },
    });
  } catch (error) {
    await prisma.notificationLog.update({
      where: { deduplicationKey: key },
      data: { status: "FAILED", attempts: 1, failureReason: failureReason(error), updatedAt: now },
    });
    if (error instanceof TelegramApiError && error.isBlocked) {
      await disconnectChat(connection.telegramChatId);
      throw new DomainError("Бот заблокирован в Telegram. Разблокируйте его и подключите снова.");
    }
    throw new DomainError("Telegram не принял сообщение. Попробуйте позже.");
  }
}

// ─── History ──────────────────────────────────────────────────────────────────

export type NotificationLogDTO = {
  id: string;
  type: "DUE_IN_DAYS" | "DUE_TODAY" | "OVERDUE" | "TEST" | "SUBSCRIPTION_CHARGE" | "PRO_EXPIRY";
  status: "PENDING" | "SENT" | "FAILED" | "CANCELLED";
  createdAt: string;
  sentAt: string | null;
  /** The debt or subscription the reminder was about. */
  debtName: string | null;
  dueDate: string | null;
  attempts: number;
  failed: boolean;
};

export async function listNotificationLog(userId: string, limit = 20): Promise<NotificationLogDTO[]> {
  const rows = await prisma.notificationLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  const itemIds = rows.flatMap((r) => (r.scheduleItemId ? [r.scheduleItemId] : []));
  const items = itemIds.length
    ? await prisma.debtScheduleItem.findMany({
        where: { userId, id: { in: itemIds } },
        select: { id: true, dueDate: true, debt: { select: { name: true } } },
      })
    : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const ruleIds = rows.flatMap((r) => (r.recurringId ? [r.recurringId] : []));
  const rules = ruleIds.length ? await prisma.recurringTransaction.findMany({ where: { userId, id: { in: ruleIds } }, select: { id: true, name: true } }) : [];
  const ruleName = new Map(rules.map((r) => [r.id, r.name]));
  return rows.map((r) => {
    if (r.recurringId) {
      // Key: sub:<recurringId>:<chargeDate>:d<n>:tg
      const chargeDate = r.deduplicationKey.split(":")[2] ?? null;
      return {
        id: r.id,
        type: r.type,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        sentAt: r.sentAt?.toISOString() ?? null,
        debtName: ruleName.get(r.recurringId) ?? null,
        dueDate: chargeDate && /^\d{4}-\d{2}-\d{2}$/.test(chargeDate) ? chargeDate : null,
        attempts: r.attempts,
        failed: r.status === "FAILED",
      };
    }
    const item = r.scheduleItemId ? byId.get(r.scheduleItemId) : undefined;
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
      debtName: item?.debt.name ?? null,
      dueDate: item ? dbToLocalDate(item.dueDate) : null,
      attempts: r.attempts,
      // The raw failure reason stays server-side (it can quote Telegram's error text).
      failed: r.status === "FAILED",
    };
  });
}
