# Fyndue Pro (billing)

## 1. Plans

| | Бесплатно | Pro |
|---|---|---|
| Operations, categories, budgets, calendar, analytics, quick entry, Telegram bot, CBU rates | ✓ | ✓ |
| Accounts / debts / subscriptions / goals (active) | 3 / 2 / 5 / 1 | unlimited |
| Shared account (family card), receipt photos, Excel export, operation templates | — | ✓ |

Prices: **29 000 UZS / month** (30 days), **249 000 UZS / year** (365 days) — `PRO_PRICES` in `lib/billing/plans.ts`.

Limits are soft: what already exists stays visible and editable; only creating more is refused (`ProRequiredError`, code `PRO_REQUIRED`, which the client turns into a toast with «Подключить Pro»).

## 2. Who is Pro (`planFor`)

- Admins (`ADMIN_EMAILS`) — always.
- `User.proUntil` in the future — a paid or granted period.
- The trial: `User.trialEndsAt`, or 14 days from `createdAt` when null. Accounts created before Pro existed got `trialEndsAt = launch + 14 days` in the migration.

## 3. Enforcement

In the services, never only in the UI: `assertWithinLimit` in `createAccount`, `createDebt`, `createRecurring` (subscriptions), `createGoal`; `assertProFeature` in `createTemplate`, `shareAccount`, `uploadTransactionReceipt`; `/api/export/transactions` redirects Free users to `/pro`. A family card works while its **owner** is Pro: members can't add operations after the owner's Pro ends.

## 4. Paying (manual for now)

1. `/pro`: the user picks month/year and writes to `PRO_CONTACT_URL` (default https://t.me/boldpunk; the button pre-fills «Хочу Fyndue Pro на год. Мой код: …») — or, when `PRO_PAYMENT_DETAILS` is set, transfers to those details with the reference code (last 6 characters of the user id) — then presses «Я оплатил» → `ProPayment` (PENDING; a new request cancels the previous one). Admins with the bot connected get a Telegram message.
2. `/admin` → «Заявки на Pro»: «Оплата пришла» confirms (proUntil moves forward from the later of now and the current end) or «Нет оплаты» rejects; the user is told in Telegram.
3. `/admin` user menu: +1 month, +1 year, any number of days (gifts, promo, cash), or take a paid period away.

Every step is a `ProPayment` row plus an audit entry (`PRO_*`).

## 5. Reminders

The notifications cron also sends one Telegram notice 3 days before Pro or the trial ends (`sendProExpiryNotices`, `NotificationLog` type `PRO_EXPIRY`, key `pro-expiry:<user>:<end date>`).

## 6. Online payment later

When a Payme/Click merchant account exists, the provider's callback confirms a `ProPayment` (method `PAYME`/`CLICK`) exactly like the admin button does — `decideProRequest` is the single place that extends `proUntil`.
