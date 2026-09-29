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

## Phase 3 — Dashboard (next)

Available balance (per currency), income/expenses/debt payments this month with previous-month comparison, Total Debt widget (principal vs. future interest clearly labelled), upcoming payments, Safe to Spend, projected balance, recent transactions. All from real data via `lib/finance/cash-flow.ts`.

## Phase 4 — Calendar, analytics, budgets

Recurring transactions & expected income; calendar month + timeline; expense analytics (by category, trend, income vs expenses); debt analytics (cost above principal, fees, cash outflow, DTI with N/A on zero income); budgets (overall + category); monthly summary; manual exchange rates.

## Phase 5 — Telegram

Bot + webhook, connection codes, notification preferences, planner, idempotent dispatcher, cron endpoint, retries, commands (`/today`, `/upcoming`, `/debts`, `/month`). Notification tests from SPEC §59.

## Phase 6 — Documents

Private storage adapter, upload/download with ownership checks, debt documents tab.

## Phase 7 — PWA & polish

Manifest, icons, standalone mode, safe areas, command palette (⌘K), onboarding flow, skeletons/empty/error states audit, accessibility audit, performance (lazy charts, pagination review), rate limiting on actions, email verification & password reset, Playwright E2E for critical flows.

## Deferred (post-MVP)

Bank integrations, automatic imports, OCR, shared family budgets, exports, native apps.
