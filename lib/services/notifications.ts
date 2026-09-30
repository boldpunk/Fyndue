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
  type ReminderIntent,
} from "@/lib/notifications/planner";
import { TelegramApiError, type TelegramSender } from "@/lib/telegram/client";
import { formatDigest } from "@/lib/telegram/messages";
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
async function claim(userId: string, intent: ReminderIntent, { now }: Clock): Promise<boolean> {
  const key = intent.deduplicationKey;
  const { count } = await prisma.notificationLog.createMany({
    data: [
      {
        userId,
        debtId: intent.item.debtId,
        scheduleItemId: intent.item.itemId,
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

function failureReason(error: unknown): string {
  // TelegramApiError messages never contain the token; anything else is reduced to its type.
  if (error instanceof TelegramApiError) return error.message.slice(0, 300);
  return error instanceof Error ? `Unexpected error: ${error.name}` : "Unexpected error";
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
    const intents = prefs.telegramEnabled ? planReminders(await openItemsFor(userId, today), prefs, today) : [];

    // Anything not planned any more (paid, rescheduled, superseded, archived,
    // or reminders switched off) is cancelled rather than retried.
    const cancelled = await prisma.notificationLog.updateMany({
      where: {
        userId,
        channel: "TELEGRAM",
        type: { not: "TEST" },
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

    const owned: ReminderIntent[] = [];
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
    throw new DomainError("Connect Telegram first.");
  }
  const key = `test:${userId}:${Math.floor(now.getTime() / 60_000)}:tg`;
  const { count } = await prisma.notificationLog.createMany({
    data: [{ userId, type: "TEST", channel: "TELEGRAM", deduplicationKey: key, scheduledAt: now, createdAt: now, updatedAt: now }],
    skipDuplicates: true,
  });
  if (count !== 1) throw new DomainError("A test message was just sent. Try again in a minute.");
  try {
    const { messageId } = await sender.sendMessage(
      connection.telegramChatId,
      "✅ <b>Fyndue is connected</b>\n\nPayment reminders will arrive in this chat. Send /help to see what I can do.",
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
      throw new DomainError("Telegram says the bot is blocked. Unblock it and connect again.");
    }
    throw new DomainError("Telegram did not accept the message. Try again later.");
  }
}

// ─── History ──────────────────────────────────────────────────────────────────

export type NotificationLogDTO = {
  id: string;
  type: "DUE_IN_DAYS" | "DUE_TODAY" | "OVERDUE" | "TEST";
  status: "PENDING" | "SENT" | "FAILED" | "CANCELLED";
  createdAt: string;
  sentAt: string | null;
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
  return rows.map((r) => {
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
