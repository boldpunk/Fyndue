# Fyndue — Security, Authentication & Authorization

> Covers SPEC §42–44, §53. Phase 1 implements authentication, isolation, validation, headers and audit logging; rate limiting and document access follow in later phases as noted.

## 1. Authentication

**Library:** [Better Auth](https://www.better-auth.com) with the Prisma adapter.

- The SPEC recommends Supabase Auth or Auth.js. Auth.js development now continues under the Better Auth project, and Better Auth keeps everything in our own Postgres (no second vendor for MVP), while still meeting the key rule: **no custom password storage** — hashing (scrypt), verification, session issuance and cookie handling are all done by the library. Our code never sees or stores a password hash.
- **Methods:** email + password (MVP). Google OAuth is enabled automatically when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set.
- **Sessions:** database-backed (`Session` table), opaque token in an `HttpOnly`, `Secure` (in production), `SameSite=Lax` cookie with the `__Secure-` prefix in production. 30-day expiry, refreshed daily. Sessions can be revoked server-side (logout deletes the row).
- **Password policy:** min 10 chars, max 128. Email verification and password reset are wired when an email provider is added (Phase 7); the tables already exist.
- **Registration:** open in development; controlled by `ALLOW_REGISTRATION` so a private production deployment can close sign-ups while keeping multi-user architecture (SPEC §3).
- **User bootstrap:** a Better Auth `databaseHooks.user.create.after` hook creates `UserSettings` and the default category set for every new user.

## 2. Authorization model

**Single rule:** every user-owned row has `userId`, and every query predicate includes the authenticated user's id (SPEC §43):

```ts
resource.id = requestedId AND resource.userId = session.user.id
```

How it's enforced:

1. **Session → userId, server side only.** `requireUser()` (`lib/auth/session.ts`) reads the session from cookies via Better Auth, redirects to `/login` if absent, and returns `{ id, email, name, timezone, baseCurrency }`. No action or service accepts a `userId` from form data, query strings or JSON.
2. **Services take `userId` as the first parameter** and put it into *every* `where`:
   - reads: `findFirst({ where: { id, userId } })` — never `findUnique({ where: { id } })` on user data;
   - writes: `updateMany/deleteMany({ where: { id, userId } })` and check `count === 1`, or load-with-owner first inside the transaction;
   - related ids in input (e.g. `accountId`, `categoryId` on a transaction, the destination of a transfer) are **each** re-loaded with `userId` inside the DB transaction before use. This blocks "attach my expense to your account" attacks.
3. **Not found, not forbidden.** A resource owned by someone else is indistinguishable from a missing one (`NotFoundError` → 404 / "not found" message). No existence oracle.
4. **Route protection is layered UX, not the boundary.** `proxy.ts` redirects requests without a session cookie; the `(app)` layout calls `requireUser()`. The boundary is (2).
5. **Tests** (`tests/integration/authorization.test.ts`): user A cannot read, update, archive or post transactions to user B's account; cannot use B's category; cannot void B's transaction; a transfer into B's account is rejected. Phase 2/6 add debts, payments and documents.
6. **Future defence in depth:** Postgres Row-Level Security with `SET app.user_id` per transaction can be layered on without changing service signatures.

## 3. Input validation

- Zod schemas (`lib/validations/*`) validate every action input on the server, even when the client already validated.
- Money inputs are parsed from **strings** into `Decimal`; the schema rejects more than 2 fractional digits, negatives where not allowed, and values above `999,999,999,999,999.99`.
- Dates are `YYYY-MM-DD` strings validated as real calendar dates.
- Enum fields are validated against Prisma enums; icon and colour fields against allow-lists (never raw CSS/HTML).
- Free text (notes, names, merchant) is length-limited and rendered as text by React (no `dangerouslySetInnerHTML`).

## 4. Web security

| Threat | Mitigation |
|---|---|
| CSRF | Server Actions only accept POST and check `Origin` against `Host` (built into Next.js); Better Auth validates `Origin` against `trustedOrigins`; cookies are `SameSite=Lax`. No state-changing GET routes. |
| XSS | React escaping; no HTML injection APIs; CSP header; icon/colour allow-lists. |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'`. |
| Headers | Set in `next.config.ts`: `Content-Security-Policy`, `Strict-Transport-Security` (prod), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation off). |
| Brute force | Better Auth built-in rate limiter on auth endpoints (Phase 1, in-memory; DB/Redis store for multi-instance deploys). Mutating actions get a per-user limiter in Phase 7. |
| Double submit | `clientRequestId` idempotency keys with unique indexes; buttons disabled while pending. |
| Secrets | Only via environment variables, validated by `lib/env.ts`; `.env*` git-ignored; `.env.example` has placeholders only. |

## 5. Error handling & logging

- Domain errors (`DomainError`, `NotFoundError`, `ValidationError`) carry user-safe messages. Unknown errors are logged server-side with a request id and returned as "Something went wrong".
- Prisma errors never reach the client (they can contain SQL, column names and values).
- **No sensitive financial data in logs:** loggers receive ids and error codes, not amounts, notes, account names, emails or tokens.

## 6. Audit logging

`AuditLog` is append-only and written **inside the same DB transaction** as the change it records, so an audit row exists if and only if the change committed. Phase 1 actions: `ACCOUNT_CREATED`, `ACCOUNT_UPDATED`, `ACCOUNT_ARCHIVED`, `ACCOUNT_ADJUSTED`, `CATEGORY_CREATED/UPDATED/ARCHIVED`, `TRANSACTION_CREATED/UPDATED/VOIDED`, `TRANSFER_CREATED`. Metadata holds changed-field snapshots, never secrets.

## 7. Documents (Phase 6)

Private bucket (S3-compatible or Supabase Storage), object keys `users/{userId}/{documentId}` with random ids, no public URLs. Download = route handler that loads `Document` by `{ id, userId }` and streams or returns a ≤ 60 s signed URL. Upload: type sniffing (PDF/JPEG/PNG only), size limit, SHA-256 stored.

## 8. Telegram (Phase 5)

Webhook authenticated by `X-Telegram-Bot-Api-Secret-Token`; one-time connection codes are random, stored hashed, expire in 10 minutes, single-use; commands resolve the user **only** through `TelegramConnection.telegramChatId`. Cron endpoint requires `Authorization: Bearer $CRON_SECRET`. See [telegram.md](telegram.md).

## 9. Data integrity (SPEC §53)

Enforced at two levels — service validation *and* database constraints — so a bug in one layer can't corrupt money:

- positive amounts, non-negative principal and payment components (CHECK),
- `actualAccountDebit = applied + processing fee` and `applied = Σ components` (CHECK),
- transfer rows always have a `transferGroupId`; voiding is per group,
- a transaction's currency must equal its account's currency (service check); cross-currency transfers store each leg in its own currency,
- one current schedule line per installment (partial unique index),
- unique `NotificationLog.deduplicationKey`,
- DB transactions for transfer, payment, reversal, early repayment and schedule regeneration.
