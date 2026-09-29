# Fyndue

Personal finance, debt & expense tracker — no missed payments, no financial chaos, one clear picture of your money.

The full product and technical specification lives in [`SPEC.md`](SPEC.md). Read it before implementing any major feature.

## Documentation

| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Layers, directory layout, route map, design system, component tiers |
| [docs/database.md](docs/database.md) | Full schema design across all phases |
| [docs/debt-engine.md](docs/debt-engine.md) | Financial calculation layer, schedule versioning, payment & reversal safety |
| [docs/security.md](docs/security.md) | Authentication, authorization, validation, headers, audit log |
| [docs/telegram.md](docs/telegram.md) | Reminder & bot architecture |
| [docs/roadmap.md](docs/roadmap.md) | Phases and milestones |

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript strict · Tailwind CSS v4 · shadcn/ui-style components on Radix · Prisma 7 + PostgreSQL · Better Auth · decimal.js · Zod · React Hook Form · Vitest.

## Getting started

Requirements: Node 22+, pnpm 10, PostgreSQL 16.

**Windows shortcut:** `powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1` installs anything missing (Node, pnpm, PostgreSQL via winget), creates the databases, writes `.env`, migrates, seeds and starts the app.

```bash
cp .env.example .env          # fill in DATABASE_URL, TEST_DATABASE_URL, BETTER_AUTH_SECRET
pnpm install                  # also generates the Prisma client
pnpm db:migrate               # apply migrations to DATABASE_URL
pnpm db:seed                  # optional, development only
pnpm dev                      # http://localhost:3000
```

The dev seed creates `demo@fyndue.dev` / `fyndue-demo-2026` with Uzcard, Visa and Cash UZS accounts and a few expenses. It refuses to run when `NODE_ENV=production`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit + integration tests |
| `pnpm test:unit` | Pure finance/validation tests (no DB) |
| `pnpm test:integration` | Service tests against `TEST_DATABASE_URL` (the run truncates it) |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma |

## Rules of the codebase

- Money is never a JS `number`: `Decimal` in `lib/finance`, `NUMERIC(20,2)` in Postgres, strings across the client boundary.
- Financial formulas live in `lib/finance` (pure), never in React components.
- Every service function takes `userId` from the session and scopes every query by it.
- Financial facts are voided/reversed, never deleted; every change writes an audit row in the same DB transaction.
