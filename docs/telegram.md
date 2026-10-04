# Fyndue — Telegram & Notification Architecture

> Phase 5 (SPEC §33–35). Implemented; this document describes the shipped behaviour.

## 1. Components

```
Scheduler (Vercel Cron / external cron, every 15 min)
   │  POST /api/cron/notifications   Authorization: Bearer CRON_SECRET
   ▼
lib/notifications/planner.ts   pure: (items, prefs, now, tz) → ReminderIntent[]
lib/notifications/dispatcher.ts  claim → send → mark
lib/telegram/client.ts           thin Bot API wrapper (sendMessage, setWebhook)
lib/telegram/messages.ts         pure message formatting (SPEC §34 templates)

Telegram ──► POST /api/telegram/webhook   X-Telegram-Bot-Api-Secret-Token
                 └─ lib/telegram/commands.ts  (/start CODE, /today, /upcoming, /debts, /month)
```

Telegram is just one **channel**; the planner and log are channel-agnostic, so in-app notifications (and later email/push) reuse the same pipeline.

## 2. Connection flow

1. Settings → Notifications → **Connect Telegram** (server action).
2. Server generates a random 8-character code (crypto RNG), stores `sha256(code)` + `expiresAt = now + 10 min` in `TelegramConnection` (status `PENDING`), and shows `t.me/<bot>?start=<code>`.
3. User sends `/start CODE`. Webhook hashes the code, finds a non-expired pending connection, stores `telegramChatId`/username, sets `CONNECTED`, clears the code hash (single use), writes `AuditLog(TELEGRAM_CONNECTED)`.
4. Invalid / expired code → generic reply, no information about accounts. `/start` from an already-linked chat is idempotent.
5. Disconnect from Settings or by blocking the bot (a 403 from Telegram marks the connection `DISCONNECTED`).

## 3. Planning reminders

For each connected user with `telegramEnabled`, for each current, unpaid (`SCHEDULED` / `PARTIALLY_PAID`) schedule item of an active debt, in the user's timezone:

| Rule | Fires when | Dedup key |
|---|---|---|
| `DUE_IN_DAYS` | `dueDate − today` falls in the window of threshold `n` (default 7, 3, 1): `(next smaller threshold, n]` | `due:{itemId}:{dueDate}:d{n}:tg` |
| `DUE_TODAY` | `dueDate = today` | `today:{itemId}:{dueDate}:tg` |
| `OVERDUE` | `today > dueDate`; round `r = ⌊(daysOverdue − 1) / overdueRepeatDays⌋` | `overdue:{itemId}:{dueDate}:r{r}:tg` |

Keys identify a *window*, not a day. If the job doesn't run on the exact day (a PC that was off), the first run later in the same window still sends the reminder, and the message states the real number of days. The shared key keeps it to one message per window. With the defaults, a payment gets reminders at 7, 3 and 1 days before, on the day, and on overdue days 1, 4, 7, …

The due date is part of the key, so a rescheduled item gets fresh reminders. Items that are paid, skipped, superseded (`isCurrent = false`) or belong to a paid-off/archived debt are never planned — paying cancels future reminders naturally, and any `PENDING` log rows for them are set `CANCELLED`.

**Subscription charges** (`lib/notifications/subscription-planner.ts`): for each active subscription (`RecurringTransaction.isSubscription`), its next charge in the next 7 days that has no recorded transaction. One threshold, `subscriptionDaysBefore` (0–3, default 1; 0 = on the day), plus 7 days for yearly ones; same window logic, key `sub:{recurringId}:{chargeDate}:d{n}:tg`, type `SUBSCRIPTION_CHARGE`, `NotificationLog.recurringId` set. No overdue reminders — the card is charged automatically. The message names the card, its current balance and warns when it is short; yearly renewals add "cancel before the charge". Switch: `subscriptionReminders`. Debt reminders come first in the digest.

**Quiet hours:** if "now" in the user's timezone falls inside quiet hours (default 22:00–09:00, may wrap midnight, can be switched off), nothing is claimed on this run. The first run after quiet hours sends it (the key still dedups).

## 4. Idempotent dispatch (SPEC §35)

```
INSERT INTO "NotificationLog" (…, "deduplicationKey", status='PENDING', attempts=0)
ON CONFLICT ("deduplicationKey") DO NOTHING
RETURNING id;
```

- Row returned → this run owns the reminder → send → `status = SENT, sentAt, externalMessageId`.
- No row → already claimed by an earlier/parallel run → skip.
- Send error → `status = FAILED, attempts += 1, failureReason` (sanitised). A later run re-claims a `FAILED` row while it is still planned, `attempts < 5` and the backoff (2^attempts minutes, max 60) has passed; `429` honours Telegram's `retry_after` (max 30 s).
- A crash between claim and send leaves a `PENDING` row; rows `PENDING` for > 10 min are re-claimed (at-least-once with a very small duplicate window).
- Every re-claim (failed, stale pending, or cancelled-but-planned-again, e.g. after a payment reversal) is a compare-and-set on `updatedAt`, so it also has a single winner.
- Each run first sets `PENDING`/`FAILED` rows that are no longer planned to `CANCELLED` (paid, rescheduled, superseded, debt archived, reminders switched off, disconnected).

Running the job twice therefore cannot send the same reminder twice. Rate limiting: at least 40 ms between sends (≤ 25 msg/s), and at most one message per user per run. Up to 8 reminders are batched into one digest, most urgent first; the rest wait for the next run.

**Where it runs.** `runReminders({ sender, now })` in `lib/services/notifications.ts` is the only entry point. It is called by:
- `GET|POST /api/cron/notifications` with `Authorization: Bearer $CRON_SECRET` (Vercel Cron or any scheduler, every 15 minutes);
- `pnpm telegram:dev` every 5 minutes for a local install.

## 5. Messages

Formatting follows SPEC §34, amounts via `formatMoney` (`3,500,000 UZS`), dates in the user's locale/timezone. Messages contain amounts and debt names, which is inherent to the feature; they never contain account numbers, emails or links with tokens. Telegram's HTML parse mode with escaped user text.

## 6. Commands

`/start CODE`, `/today` (due today + overdue), `/upcoming` (next 14 days), `/debts` (remaining principal + progress), `/month` (income, expenses, debt payments this month), `/subs` (subscriptions: monthly total and charges in the next 30 days), `/help`, `/stop` (disconnect). Every command resolves the user by `chatId → TelegramConnection(CONNECTED) → userId` and calls the same `lib/services` queries as the web app. Future `/expense`, `/income`, `/paid` reuse the same server actions' services and validation.

## 7. Tests (SPEC §59)

Reminder sends once; a second cron run sends nothing; concurrent runs send once; paying an item cancels the remaining reminders; overdue fires on day 1 and on the repeat interval; quiet hours defer and later send; expired/used connection code is rejected.

Implemented in `tests/unit/notifications.test.ts` (planner windows, overdue rounds, quiet hours across midnight, SPEC §34 message text, HTML escaping, command parsing) and `tests/integration/notifications.test.ts`. The integration tests also cover: retry after backoff, the 5-attempt limit, 403 → disconnected, digest batching, per-user isolation, the test-message limit, a chat moving between accounts, and bot commands only showing the linked user's data.

## 8. Setting up a bot

1. In Telegram, open **@BotFather** → `/newbot` → pick a name and a username ending in `bot`.
2. Put the token and the username (without `@`) in `.env` as `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`, then restart the app.
3. **Local:** run `pnpm telegram:dev` next to `pnpm dev`. **Deployed:** set `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET`, call `setWebhook` with `https://<host>/api/telegram/webhook` and the secret, and schedule `/api/cron/notifications`.
4. Open Settings → Notifications → **Connect Telegram**.
