# Fyndue — Telegram & Notification Architecture

> Design for Phase 5 (SPEC §33–35). Not implemented yet.

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
| `DUE_IN_DAYS` | `dueDate − today ∈ notifyDaysBefore` (default 7, 3, 1) | `due:{itemId}:{dueDate}:d{n}:tg` |
| `DUE_TODAY` | `dueDate = today` | `today:{itemId}:{dueDate}:tg` |
| `OVERDUE` | `today > dueDate`, first day and then every `overdueRepeatDays` | `overdue:{itemId}:{dueDate}:{today}:tg` |

The due date is part of the key, so a rescheduled item gets fresh reminders. Items that are paid, skipped, superseded (`isCurrent = false`) or belong to a paid-off/archived debt are never planned — paying cancels future reminders naturally, and any `PENDING` log rows for them are set `CANCELLED`.

**Quiet hours:** if "now" in the user's timezone falls inside quiet hours, intents are not claimed on this run; a later run after quiet hours picks them up (the key still dedups). Reminders are also only sent after 09:00 local time by default.

## 4. Idempotent dispatch (SPEC §35)

```
INSERT INTO "NotificationLog" (…, "deduplicationKey", status='PENDING', attempts=0)
ON CONFLICT ("deduplicationKey") DO NOTHING
RETURNING id;
```

- Row returned → this run owns the reminder → send → `status = SENT, sentAt, externalMessageId`.
- No row → already claimed by an earlier/parallel run → skip.
- Send error → `status = FAILED, attempts += 1, failureReason` (sanitised). Retry job re-attempts `FAILED` rows with `attempts < 5` using backoff; `429` honours Telegram's `retry_after`.
- A crash between claim and send leaves a `PENDING` row; rows `PENDING` for > 10 min are retried (at-least-once with very small duplicate window; acceptable and logged).

Running the job twice therefore cannot send the same reminder twice. Rate limiting: a global ≤ 25 msg/s token bucket and at most one message per user per run (multiple reminders are batched into a single digest message).

## 5. Messages

Formatting follows SPEC §34, amounts via `formatMoney` (`3,500,000 UZS`), dates in the user's locale/timezone. Messages contain amounts and debt names, which is inherent to the feature; they never contain account numbers, emails or links with tokens. Telegram's HTML parse mode with escaped user text.

## 6. Commands

`/today`, `/upcoming` (next 14 days), `/debts` (remaining principal + progress), `/month` (income, expenses, debt payments this month). Every command resolves the user by `chatId → TelegramConnection(CONNECTED) → userId` and calls the same `lib/services` queries as the web app. Future `/expense`, `/income`, `/paid` reuse the same server actions' services and validation.

## 7. Tests (SPEC §59)

Reminder sends once; a second cron run sends nothing; concurrent runs send once; paying an item cancels the remaining reminders; overdue fires on day 1 and on the repeat interval; quiet hours defer and later send; expired/used connection code is rejected.
