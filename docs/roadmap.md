# Fyndue — Roadmap

Small, reviewable milestones. Each milestone ends green: `pnpm typecheck && pnpm lint && pnpm test` pass, docs updated when architecture changes (SPEC §63).

## Phase 0 — Planning ✅

- [x] Read SPEC.md
- [x] `docs/architecture.md` — architecture, routes, design system, component tiers
- [x] `docs/database.md` — full schema design
- [x] `docs/debt-engine.md` — calculation layer, versioning, payment/reversal safety
- [x] `docs/security.md` — authN/authZ, validation, headers, audit
- [x] `docs/telegram.md` — notification architecture
- [x] `docs/roadmap.md`

## Phase 1 — Foundation ✅

| # | Milestone | Done when |
|---|---|---|
| ✅ 1.1 | Scaffold: Next.js 16, TS strict, pnpm, ESLint, Prettier, Vitest, env validation | `pnpm build` succeeds |
| ✅ 1.2 | Design tokens (light/dark/system), Geist, shadcn/ui primitives, `Money`/`MoneyInput`/badges | tokens documented in `globals.css` |
| ✅ 1.3 | Prisma 7 + Postgres, Phase 1 schema (User, auth tables, UserSettings, Account, Category, Transaction, AuditLog), SQL check constraints | migration applies on a clean DB |
| ✅ 1.4 | Better Auth: register, login, logout, session, `proxy.ts`, `requireUser()`, user bootstrap (settings + default categories) | can sign up and reach `/dashboard` |
| ✅ 1.5 | App shell: sidebar, mobile bottom nav, page header, theme toggle, Quick Add | navigation works at 375 px and desktop |
| ✅ 1.6 | `lib/finance/money.ts`, `dates.ts`, `balance.ts` with unit tests | decimal precision tests pass |
| ✅ 1.7 | Accounts: list (grouped by currency), create, edit, archive, balance adjustment | integration tests incl. authorization |
| ✅ 1.8 | Categories: defaults, create, rename, reorder, archive, icon, colour | |
| ✅ 1.9 | Transactions: expense, income (actual/expected), transfer (incl. cross-currency), adjustment, edit, void, filtered paginated list, Quick Add | balance invariant tests; A-cannot-touch-B tests |
| ✅ 1.10 | Dashboard shell with real balances by currency and this-month income/expense totals (no hardcoded data) | |
| ✅ 1.11 | Dev seed (demo user, Uzcard/Visa/Cash UZS, demo expenses) | `pnpm db:seed` refuses in production |

Phase 1 notes:

- The dashboard shows real balances, income and expenses per currency. Debt widgets, Safe to Spend and projections come in Phases 2–3.
- Debts, Payments, Calendar, Budgets and Analytics routes are placeholders so navigation is complete.
- Follow-ups: nonce-based CSP instead of `'unsafe-inline'`, per-user rate limits on actions, Playwright E2E suite (all Phase 7).

## Phase 2 — Debt engine ✅

Test-first. Pure engine before persistence.

1. ✅ Schema: Debt, DebtScheduleVersion, DebtScheduleItem, DebtPayment + checks + partial unique index; `Transaction.debtId/debtPaymentId`.
2. ✅ `schedule.ts`, `differential.ts`, `annuity.ts`, `installment.ts`, `microloan.ts` + unit tests (SPEC §59 list).
3. ✅ `payment-allocation.ts`, `debt-progress.ts`, `payment-status.ts` + tests (Debt B = 30.56%).
4. ✅ Debt create service (debt + version 1 + items + optional disbursement, atomic) and wizard UI.
5. ✅ Debt list (tabs) and detail (overview, schedule table/cards).
6. ✅ Record payment (full/partial, processing fee) + integration tests.
7. ✅ Reverse payment + tests (round-trip returns all balances).
8. ✅ Early repayment preview + apply (versioning) + tests.
9. ✅ Manual schedule edit / bank-schedule override (new version).
10. ✅ `/payments` page (upcoming, overdue, history). Seed Debt A, Debt B, demo microloan.

Phase 2 notes:

- Implemented: the debt creation wizard (7 steps, live schedule preview), debt list with Active / Paid off / Archived tabs and the Total Debt widget, and debt detail with Overview, Schedule (current version plus any past version), Payments (with reverse) and Settings (edit / archive) tabs. Also: Mark as paid with the full breakdown and card fee, partial payments, extra principal payment with a before/after preview, manual or bank schedule override, the `/payments` page (overdue, next 60 days, history), real "Debt payments this month" on the dashboard, and the seeded SPEC debts.
- Placeholders: the debt Analytics tab (Phase 4) and Documents tab (Phase 6).
- Next: make Phase 3 dashboard widgets (upcoming payments, Safe to Spend, projected balance) reuse `listUpcomingPayments`, `debtTotalsByCurrency` and `lib/finance/debt-progress`.

## Phase 3 — Dashboard ✅

- ✅ `lib/finance/cash-flow.ts` (test-first): Safe to Spend, projected balance, month-over-month change, debt-to-income ratio.
- ✅ `getDashboard()`: one service returning every figure per currency, with no conversion between currencies.
- ✅ Dashboard: available balance; income, expenses and debt payments this month with a previous-month comparison (shown only when last month has activity); debt payments as a share of income (N/A without income); Safe to Spend; projected month-end balance; overdue alert; upcoming payments (next 30 days, Mark as paid inline); Total Debt widget; recent transactions; accounts.
- ✅ Dev seed adds last month's and this month's salary, an expected next payday, and last month's expenses.

Phase 3 notes:

- Safe to Spend = available balance − open debt payments due up to and including the next expected income date. Without expected income, the horizon is the end of the month. Overdue payments always count. Only accounts marked "include in total" are used.
- Projected balance runs to the end of the month. Planned expenses are 0 until recurring transactions exist (Phase 4); the card says so.
- Both cards are labelled as estimates, "Projected, not guaranteed" and "not financial advice" (SPEC §13, §14).

## Phase 4 — Calendar, analytics, budgets ✅

- ✅ Schema: `RecurringTransaction`, `Budget`, `ExchangeRate`. Transactions link to the recurring occurrence they record. Partial unique indexes allow one live recording per occurrence and one budget per month/category/currency.
- ✅ `lib/finance` (test-first): `recurrence` (month-end clamping, leap years, intervals, monthly equivalent), `budget`, `fx` (latest manual rate on or before a date; inverse allowed; never invented), `monthGrid`, `resolveRange`, `groupByMonth`, `formatCompactMoney`.
- ✅ Recurring items at `/transactions/recurring`: bills, subscriptions and income. They stay plans until recorded, and each occurrence can be recorded once (again if its transaction is voided).
- ✅ Calendar at `/calendar`: month grid and timeline; a day panel with Mark as paid, Record and Mark received.
- ✅ Budgets at `/budgets`: overall and per-category limits; on-track / near-limit / over states with icon and label; spending without a budget; copy last month's budgets.
- ✅ Analytics at `/analytics`: range presets and custom range, currency switch; income vs expenses, daily spending, spending by category, net cash flow, debt analytics, and the SPEC §39 monthly summary (reproducible from source rows). The debt detail page has an Analytics tab.
- ✅ Dashboard: planned recurring expenses feed the projection; recurring income counts as expected income; a combined balance is shown at the user's own rates.
- ✅ Manual exchange rates at `/settings/exchange-rates`.

Phase 4 notes:

- Charts are plain SVG (`components/charts/`), not Recharts. They are small, need no client bundle beyond the page, and follow the dataviz mark specs: bars ≤ 24px, 4px rounded data ends, 2px gaps, hairline grid, a legend for ≥ 2 series, a hover/focus tooltip, and a table view on every chart. The palette (categorical slots 1–3 plus a blue/red diverging pair) was validated for colour-blind safety in light and dark mode against Fyndue's card surfaces. Light-mode aqua is below 3:1 contrast, which the legend and table view cover.
- Safe to Spend still reserves only debt payments. Recurring expenses reduce the projected balance but are not treated as mandatory.
- Planned occurrences dated before today that were never recorded are not counted in projections (they may have been paid without being recorded).

## Phase 5 — Telegram (next)

Bot + webhook, connection codes, notification preferences, planner, idempotent dispatcher, cron endpoint, retries, commands (`/today`, `/upcoming`, `/debts`, `/month`). Notification tests from SPEC §59.

## Phase 6 — Documents

Private storage adapter, upload/download with ownership checks, debt documents tab.

## Phase 7 — PWA & polish

Manifest, icons, standalone mode, safe areas, command palette (⌘K), onboarding flow, skeletons/empty/error states audit, accessibility audit, performance (lazy charts, pagination review), rate limiting on actions, email verification & password reset, Playwright E2E for critical flows.

## Deferred (post-MVP)

Bank integrations, automatic imports, OCR, shared family budgets, exports, native apps.
