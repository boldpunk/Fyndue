# Fyndue — Architecture

> Status: Phase 0 (planning) and Phase 1 (foundation) complete. Next: Phase 2 (debt engine).
> Source of truth for product requirements: [`SPEC.md`](../SPEC.md).
> Related: [database](database.md) · [debt engine](debt-engine.md) · [security](security.md) · [telegram](telegram.md) · [roadmap](roadmap.md)

## 1. Guiding decisions

| Concern | Decision | Why |
|---|---|---|
| App shape | One Next.js (App Router) application, deployed as a single unit | MVP scale; Server Components + Server Actions remove the need for a separate API tier. |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | Financial code needs the compiler on our side. |
| Package manager | pnpm | Fast, strict dependency resolution. |
| Database | PostgreSQL 16 | `NUMERIC`, `DATE`, partial indexes, check constraints, row locks. |
| ORM | Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) | Typed queries, migrations, `Decimal` support. |
| Auth | Better Auth (email/password, optional Google) with the Prisma adapter | Library-managed password hashing and DB-backed sessions (no custom password storage). Auth.js development has moved under the Better Auth project, so this is the maintained successor of the SPEC's "Auth.js" option. See [security.md](security.md). |
| Money math | `decimal.js` in `lib/finance`, `NUMERIC(20,2)` in Postgres | Never IEEE-754 floats for money (SPEC §45). |
| Validation | Zod schemas in `lib/validations`, shared by forms and server actions | One definition, validated again on the server. |
| UI | Tailwind CSS v4, shadcn/ui (Radix primitives), Lucide, Geist font | SPEC §48. |
| Charts | Recharts, lazy loaded | SPEC §58. |
| Tests | Vitest (unit + DB integration), Playwright for critical E2E later | Financial engine is test-first. |

## 2. Layered structure

```
┌──────────────────────────────────────────────────────────────┐
│ app/  (routes, layouts, loading/error UI)                     │
│   Server Components read via lib/services/*/queries           │
│   Client Components call Server Actions (actions.ts)          │
├──────────────────────────────────────────────────────────────┤
│ Server Actions  (app/(app)/**/actions.ts)                     │
│   1. requireUser()  2. zod parse  3. call service             │
│   4. revalidatePath  5. return typed ActionResult              │
├──────────────────────────────────────────────────────────────┤
│ lib/services/*  (server-only domain services)                 │
│   Ownership checks, DB transactions, audit log, balances      │
│   Every function takes `userId` as its first argument          │
├───────────────────────────────┬──────────────────────────────┤
│ lib/finance/* (pure, no I/O)  │ lib/db (Prisma client)       │
│   money, schedules, progress, │                              │
│   status, cash-flow, budget   │                              │
└───────────────────────────────┴──────────────────────────────┘
```

Rules:

1. **Components never compute money.** They format values that came from `lib/finance` or the database (SPEC §50).
2. **`lib/finance` is pure.** No Prisma, no `Date.now()` — "today" is always passed in. This makes every formula unit-testable and deterministic.
3. **`lib/services` is the only place that writes to the database.** Services import `server-only`, so they can never be bundled to the client.
4. **`userId` never comes from the client.** Actions obtain it from the session and pass it down (see [security.md](security.md)).
5. **Decimals cross the server→client boundary as strings.** Prisma `Decimal` is not serialisable to Client Components; services map rows to DTOs with string amounts, and `<Money>` formats them.

## 3. Directory layout

```text
app/
  (auth)/                 login, register — public, centered card layout
  (app)/                  authenticated shell (sidebar + mobile bottom nav)
    dashboard/
    transactions/
    debts/                (Phase 2)
    payments/             (Phase 2)
    calendar/             (Phase 4)
    accounts/
    budgets/              (Phase 4)
    analytics/            (Phase 4)
    settings/
      categories/
  api/
    auth/[...all]/        Better Auth handler
    cron/notifications/   (Phase 5)
    telegram/webhook/     (Phase 5)
    documents/[id]/       (Phase 6, signed/private download)
  layout.tsx              fonts, ThemeProvider, <Toaster/>
  manifest.ts             PWA manifest

components/
  ui/                     shadcn/ui primitives (button, dialog, sheet, …)
  finance/                Money, MoneyInput, PaymentStatusBadge, FinancialMetricCard, …
  layout/                 AppSidebar, MobileNav, PageHeader, ThemeToggle, QuickAdd
  accounts/ transactions/ categories/ debts/ dashboard/ analytics/

lib/
  auth/                   Better Auth server config, client, requireUser()
  db/                     Prisma client singleton
  finance/                money.ts, dates.ts, balance.ts (+ Phase 2: differential.ts, annuity.ts, …)
  services/               accounts.ts, categories.ts, transactions.ts, audit.ts, …
  validations/            zod schemas
  notifications/ telegram/  (Phase 5)
  utils/                  cn(), result helpers, constants

prisma/
  schema.prisma
  migrations/
  seed.ts                 development-only

tests/
  unit/                   pure finance/validation tests
  integration/            service tests against a real Postgres (fyndue_test)
docs/
```

The SPEC's `app/(dashboard)/` group is named `(app)/` here so that the group name does not collide with the `/dashboard` route segment it contains; the URL structure is unchanged.

## 4. Route map

| Route | Kind | Phase | Notes |
|---|---|---|---|
| `/` | redirect | 1 | → `/dashboard` if signed in, else `/login` |
| `/login`, `/register` | page | 1 | Public. Redirect to `/dashboard` when already signed in. |
| `/onboarding` | page | 7 | Currency → accounts → debts → Telegram, every step skippable |
| `/dashboard` | page | 1 (shell) / 3 (real widgets) | |
| `/transactions` | page | 1 | Filters via search params (`type`, `account`, `category`, `month`, `page`) |
| `/transactions/new?type=expense` | page | 1 | Full-page form; Quick Add dialog uses the same form |
| `/transactions/[id]` | page | 1 | Edit / void |
| `/accounts` | page | 1 | Grouped by currency; totals never mix currencies |
| `/accounts/new`, `/accounts/[id]` | page | 1 | Create / detail + edit + archive |
| `/settings` | page | 1 | Profile, base currency, timezone, theme |
| `/settings/categories` | page | 1 | Create, rename, reorder, archive, icon, colour |
| `/settings/notifications` | page | 5 | Telegram connect |
| `/debts` | page | 2 | Tabs via `?tab=active\|paid\|archived` |
| `/debts/new` | page | 2 | Wizard (steps in URL state, persisted atomically on final step) |
| `/debts/[id]` | page | 2 | Tabs: overview, schedule, payments, analytics, documents, settings |
| `/payments` | page | 2 | Upcoming / overdue / history |
| `/calendar` | page | 4 | Month + timeline views |
| `/budgets` | page | 4 | |
| `/analytics` | page | 4 | Range via `?range=` |
| `/api/auth/[...all]` | route handler | 1 | Better Auth |
| `/api/cron/notifications` | route handler | 5 | Protected by `CRON_SECRET` bearer |
| `/api/telegram/webhook` | route handler | 5 | Protected by Telegram secret-token header |
| `/api/documents/[id]` | route handler | 6 | Ownership-checked streaming / short-lived signed URL |

Mutations use **Server Actions** (built-in origin check, progressive enhancement). Route handlers are reserved for third parties (auth callbacks, Telegram, cron, file streaming).

Access control is enforced in three places: `proxy.ts` (Next 16 middleware) does an optimistic cookie check and redirects unauthenticated users; the `(app)` layout calls `requireUser()`; and every service call is scoped by `userId`. Only the last one is a security boundary — the first two are UX.

## 5. Data flow examples

**Read (Server Component):**
`app/(app)/accounts/page.tsx` → `requireUser()` → `listAccounts(user.id)` → DTOs with string amounts → `<AccountCard>`.

**Write (Server Action):**
`<TransactionForm>` (react-hook-form + zod resolver) → `createTransactionAction(formData)` → `requireUser()` → `transactionInputSchema.parse()` → `createTransaction(user.id, input)` which opens `prisma.$transaction`, verifies account/category ownership, inserts the row(s), atomically increments the account balance(s), writes an `AuditLog` row, commits → `revalidatePath('/transactions')` → `{ ok: true }`.

Actions return a discriminated union `{ ok: true, data } | { ok: false, error, fieldErrors? }`. Errors are sanitised: domain errors (`DomainError`) carry a user-safe message; anything else is logged server-side and surfaced as a generic message.

## 6. Money, currency, time

- **Storage:** `NUMERIC(20,2)` for amounts (UZS, USD, EUR, RUB all use 2 minor digits), `NUMERIC(9,6)` for annual rates in percent, `NUMERIC(20,8)` for manual FX rates.
- **Computation:** `lib/finance/money.ts` wraps `decimal.js` (precision 40, `ROUND_HALF_UP`). Rounding happens only at defined boundaries (a schedule line, a stored value), never in the middle of a formula.
- **Currency:** every amount-bearing row stores its `currency`. Totals are grouped by currency. Conversion only happens with an explicit, user-entered rate (e.g. a cross-currency transfer stores both legs' amounts). We never fetch or invent FX rates.
- **Calendar dates vs instants:** business dates (transaction date, due date, payment date, budget month) are stored as Postgres `DATE` and handled in code as `YYYY-MM-DD` strings (`lib/finance/dates.ts`). They have no timezone and therefore can't drift by a day. Instants (`createdAt`, `sentAt`, sessions) are `timestamptz` in UTC. "Today" is computed in the user's timezone (default `Asia/Tashkent`) and passed into pure functions.

## 7. Telegram and background work

Summarised here, detailed in [telegram.md](telegram.md). A cron-triggered route handler (Vercel Cron or any external scheduler) computes due reminders, **claims** each one by inserting a `NotificationLog` row with a unique `deduplicationKey`, and only then sends. A second run finds the key already claimed and skips it — the job is idempotent by construction. The Telegram bot uses a webhook route with a secret-token header.

## 8. Design system & component architecture

Detailed tokens live in `app/globals.css`; this is the contract.

**Tokens** (CSS variables, Tailwind v4 `@theme inline`, light + dark values):

| Token | Use |
|---|---|
| `background`, `foreground`, `card`, `popover`, `muted`, `border`, `input`, `ring` | Neutral surfaces (zinc/slate scale) |
| `primary` | Indigo — primary actions, focus ring, selected nav |
| `success` | Green — paid, positive cash flow, income |
| `warning` | Amber — due soon, budget near limit |
| `danger` (`destructive`) | Red — overdue, destructive actions, over budget |
| `info` | Blue — informational notices, projections |
| `*-foreground`, `*-subtle` | Text on the colour; soft background tint for badges |
| `radius` | 0.75rem base; cards `lg`, inputs `md`, badges `full` |

Rules: status is never conveyed by colour alone (badge = icon + label + colour, SPEC §7); financial numbers use `font-variant-numeric: tabular-nums` via the `.tabular` utility and are right-aligned in tables; motion is limited to 150–200 ms opacity/transform transitions and respects `prefers-reduced-motion`. Themes: light, dark, system (`next-themes`, class strategy, persisted in `UserSettings.theme` and a cookie-free local preference).

**Component tiers:**

1. `components/ui/*` — unstyled-logic primitives from shadcn/ui (Button, Input, Dialog, Sheet, Select, DropdownMenu, Tabs, Badge, Card, Skeleton, Tooltip, Command, Progress, Sonner). Owned in-repo, restyled with our tokens. No domain knowledge.
2. `components/finance/*` — domain-aware primitives reused across features:
   - `Money` (amount string + currency → locale-formatted, tabular, optional sign/tone)
   - `MoneyInput` (text input with grouping, decimal-safe, never parses to `number`)
   - `PaymentStatusBadge`, `TransactionTypeBadge`
   - `FinancialMetricCard`, `ProgressBar`/`DebtProgress`, `BudgetProgress`
   - `CategoryIcon` (icon name + colour from the category)
   - `EmptyState`
3. `components/layout/*` — `AppSidebar`, `MobileNav`, `PageHeader`, `ThemeToggle`, `QuickAdd`, `UserMenu`, later `CommandPalette`.
4. Feature components (`components/accounts`, `components/transactions`, …) — forms, lists and cards composed from tiers 1–3. Forms are Client Components; lists render on the server where possible.

Responsive behaviour: `Dialog` on ≥ `md`, `Sheet side="bottom"` below (`ResponsiveDialog` wrapper); tables collapse to card lists on mobile; bottom navigation respects `env(safe-area-inset-bottom)`.

## 9. Configuration

Environment variables are validated at startup by `lib/env.ts` (zod). Phase 1 needs `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; optional `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Later phases add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, storage credentials. See `.env.example`.

## 10. Extensibility (SPEC §3)

- **Public registration / family budgets:** all data is keyed by `userId`; a future `Household` would add a membership table and widen the ownership predicate in one place (`lib/services/*`).
- **Bank integrations / imports / OCR:** `Transaction.source` (`MANUAL`, later `IMPORT`, `BANK_SYNC`, `OCR`) plus `externalId` for deduplication; `DebtScheduleVersion.reason = BANK_IMPORT` already exists.
- **Native apps:** services are UI-agnostic; exposing them through route handlers later is mechanical.
