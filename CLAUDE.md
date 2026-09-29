@AGENTS.md

# Fyndue working rules

- Read `SPEC.md` and the relevant `docs/*.md` before a major feature. Work phase by phase (`docs/roadmap.md`).
- Never use JS floating point for money; use `lib/finance/money.ts`. Add tests before changing debt calculation logic.
- Business dates are `YYYY-MM-DD` strings (`lib/finance/dates.ts`); never derive them from a UTC `Date`.
- Server-only services in `lib/services/*` take `userId` first and scope every query by it; actions get `userId` from `requireUser()` only.
- Run `pnpm typecheck && pnpm lint && pnpm test` before committing. Update docs when architecture changes.
