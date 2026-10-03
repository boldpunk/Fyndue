# Fyndue — Debt Engine

> Status: implemented in Phase 2. Pure engine: `lib/finance/{schedule,differential,annuity,installment,microloan,early-repayment,payment-allocation,payment-status,debt-progress,debt-cost,debt-plan}.ts`. Persistence: `lib/services/{debts,debt-schedule,debt-payments}.ts`. Tests: `tests/unit/debt-*.test.ts`, `tests/integration/debts.test.ts`.
> Rule: tests are written before any change to debt calculation logic (SPEC §63.7).

## 0. Implementation notes (Phase 2)

- `decimal.js`'s `isPositive()` returns `true` for zero; the engine always uses explicit `gt(0)` / `lte(0)` comparisons.
- `lib/finance/debt-plan.ts` builds a new debt's initial schedule. The wizard runs it in the browser for the live preview and `createDebt` runs it again on the server, so what you preview is what gets saved.
- **Paid before tracking** (`paidBeforeTracking`) is principal repaid before Fyndue. It counts toward progress and reduces `currentPrincipal`, but moves no account. The first tracked line's interest accrues from the month before `firstPaymentDate`.
- **Known total repayment:** principal is allocated to each amount due pro rata; the remainder is stored in the line's `plannedFees` and labelled "Interest & fees (not itemised)".
- **Settling a line:** a line becomes `PAID` when its paid total reaches the planned total, or when the user ticks "This settles the installment" after paying at least its principal (for when the bank's actual interest was lower than the estimate).
- **Partially paid lines are frozen** when the schedule is regenerated. The principal they still owe is reserved, so new lines amortise `currentPrincipal − reserved`.
- **Reversing an early repayment** is allowed only while its version is the latest and no payment was made on its lines. It restores the lines that version replaced, by copying them into a new `CORRECTION` version.

The debt engine answers: *what is owed, what was paid, how it split into principal / interest / fees, what is due next, and what changes when something unusual happens.* It is split into a **pure calculation layer** (`lib/finance`) and a **persistence layer** (`lib/services/debts*.ts`) that applies calculations inside database transactions.

## 1. Pure calculation layer (`lib/finance`)

All functions are deterministic, take plain values (`Decimal`, `LocalDate` strings, enums) and return plain values. None of them read the clock or the database.

| File | Responsibility |
|---|---|
| `money.ts` | `Decimal` construction from strings, `sum`, `roundMoney(x, scale)`, `isZero`, `formatMoney` (display only), `parseMoneyInput` ("1 234 567,89" → `Decimal`). Throws on `number` inputs with fractional parts to stop float leakage. |
| `dates.ts` | `LocalDate` (`YYYY-MM-DD`) helpers: `todayIn(tz)`, `addMonthsClamped` (31 Jan + 1 month = 28/29 Feb), `dueDateForMonth(year, month, paymentDay)`, `daysBetween`, `yearFraction(a, b, convention)`. |
| `balance.ts` | Account balance from opening balance + signed flows (Phase 1). |
| `schedule.ts` | Shared types (`ScheduleLine`, `ScheduleInput`), `buildPeriods()` (due dates), `validateSchedule()` (principal sums to basis, no negatives, monotonic dates, closing = opening − principal), `totals()`. |
| `differential.ts` | `generateDifferentialSchedule(input)` |
| `annuity.ts` | `annuityPayment(P, r, n)`, `generateAnnuitySchedule(input)` |
| `installment.ts` | Interest-free: equal split with residual on last line, or user-supplied irregular lines; "already paid" handling. |
| `microloan.ts` | Fee-mode resolution → `{ contractPrincipal, netReceived, principalBasis, feeLines }`, known-total-repayment mode. |
| `early-repayment.ts` | `applyExtraPrincipal(state, amount, strategy)` → new future lines + comparison (old/new payoff, months reduced, interest delta *estimate*). |
| `payment-allocation.ts` | Validate a user breakdown; suggest a default split for a schedule item (fees → penalty → interest → principal). |
| `debt-progress.ts` | Paid / remaining principal and percentages, payments completed/remaining, next payment, projected payoff. |
| `payment-status.ts` | Display status from stored status + due date + today + thresholds. |
| `cash-flow.ts` | Safe to Spend, projected month-end balance (Phase 3). |
| `debt-cost.ts` | Total cost above principal, total cash outflow (Phase 4). |
| `budget.ts` | Spent / limit / percentage (Phase 4). |

### 1.1 Precision and rounding

- `Decimal.set({ precision: 40, rounding: ROUND_HALF_UP })`.
- Rates are converted once: `monthlyRate = annualPercent / 100 / 12` — kept unrounded.
- Each schedule line's `interest` and `principal` is rounded to `debt.roundingScale` (default 2; some Uzbek lenders round to whole sums → 0).
- **Residual rule:** the final line's principal is `openingPrincipal` of that line (not the formula value), so Σ principal = principal basis exactly and the closing principal of the last line is exactly `0`.
- Results are validated by `validateSchedule()` before anything is persisted.

### 1.2 Differential (SPEC §17)

```
principal_part_i = round(basis / n)             (last line: remaining opening principal)
interest_i       = round(opening_i × periodRate_i)
payment_i        = principal_part_i + interest_i + fees_i
```

`periodRate_i` depends on `dayCountConvention`:

| Convention | periodRate |
|---|---|
| `MONTHLY_30_360` (default, SPEC formula) | `annual / 12` |
| `ACTUAL_365` | `annual × days(prev_due, due) / 365` |
| `ACTUAL_360` | `annual × days / 360` |
| `ACTUAL_ACTUAL` | split the period at 1 January and weight by 365/366 (leap years) |

The first period runs from `startDate` to the first due date, so a non-standard first period is handled naturally.

#### Payments moved off weekends (`Debt.shiftWeekends`)

Banks in Uzbekistan move a payment that falls on a Saturday, Sunday or public holiday to the next working day (`lib/finance/business-days.ts`; fixed Labour Code holidays — the lunar Hayit days are announced yearly and are not included). Verified line by line against a real bank schedule (contract MKO-2026-32249, `tests/unit/business-days.test.ts`):

- `dueDate` moves; interest periods still run between the contract dates (stored as `DebtScheduleItem.accrualDate` when different).
- The moved line's principal stays unpaid for the extra days, so the **next** line adds `principal_prev × rate × extra days` (`lineInterest`, `carryOver` across regenerations). E.g. 23 Jan 2027 (Sat) → 25 Jan: line 6 gets +2 days on 2 383 333.33 = 4 962.55.
- New debts: a wizard switch, on by default except for personal debts; typed-in schedules keep the user's dates. Existing debts: Settings → switch, which writes a new `CORRECTION` version of the open lines (estimates are recomputed, bank/manual amounts only move dates).

### 1.3 Annuity (SPEC §18)

```
A = P × r(1+r)^n / ((1+r)^n − 1)       r = monthly rate;  r = 0 ⇒ A = P / n
```

`A` is rounded once; each line's interest is `round(opening × r)`, principal = `A − interest`; the last line takes the residual principal (its payment differs by a few tiyin — displayed as-is, as banks do). For non-30/360 conventions the payment is still computed with `r`, while line interest uses the actual period rate, matching common bank practice; the bank schedule overrides anyway.

### 1.4 Interest-free installments (SPEC §19)

Two modes:

1. **Generated** — `remaining / count`, residual on the last line.
2. **Manual lines** — the user enters `(dueDate, amount)` pairs of any size and date. Validation requires Σ amount = remaining.

**Already paid before tracking** (Debt B): `paidBeforeTracking = 49,986,962.63`. It reduces `currentPrincipal` (`163,593,696 − 49,986,962.63 = 113,606,733.37`) and counts toward progress, but creates **no** account transaction (the money left before Fyndue existed). Progress: `49,986,962.63 / 163,593,696 × 100 = 30.5557…% → 30.56%` (display rounded to 2 dp; the stored/compared value stays unrounded).

### 1.5 Microloans and fees (SPEC §19A)

| Fee mode | contract principal | net received | principal basis (schedule/progress) | fee handling |
|---|---|---|---|---|
| `ADDED_ON_TOP` | 2,000,000 | 2,000,000 | 2,000,000 | 100,000 is a separate `plannedFees` amount on the schedule (default: first/only line) |
| `DEDUCTED_FROM_DISBURSEMENT` | 2,000,000 | 1,900,000 | 2,000,000 | fee is recorded as withheld at disbursement; nothing to repay beyond principal (+interest) |
| `FINANCED_INTO_DEBT` | 2,000,000 | 2,000,000 | 2,100,000 | fee becomes principal — only when the user explicitly selects it |
| `CUSTOM` | user | user | user | manual schedule lines with explicit fee columns |

**Progress denominator** is always `principalBasis`; the UI labels contract principal, fee, net received and basis separately, never merged.

**Known total repayment mode:** repayment type `MANUAL`, `knownTotalRepayment = true`, `contractTotalRepayment = 2,100,000`. The engine creates the lines the user enters and puts `total − principal` into an "unallocated cost" (displayed as *Interest & fees (not itemised)*). No interest formula is invented.

**Disbursement:** if the user picks a receiving account, a `LOAN_DISBURSEMENT` inflow of `netAmountReceived` is created in the same DB transaction as the debt. It never counts as income.

### 1.6 Payment breakdown invariants

For every payment (enforced in `payment-allocation.ts` **and** by DB check constraints):

```
amountAppliedToDebt = principal + interest + originationFee + penalty + otherFee
actualAccountDebit  = amountAppliedToDebt + paymentProcessingFee
all components >= 0,  actualAccountDebit > 0
principal <= currentPrincipal
```

Example (SPEC §19A): applied `2,100,000` (principal 2,000,000 + origination fee 100,000), processing fee `15,000`, debit `2,115,000`. The account drops by 2,115,000; the debt principal drops by 2,000,000; fee analytics see 100,000 origination + 15,000 processing; expense analytics see **nothing** (debt payments are excluded, so fees are not double-counted).

### 1.7 Status (SPEC §12)

Stored status (changes only on writes): `SCHEDULED`, `PARTIALLY_PAID`, `PAID`, `SKIPPED`, `RESCHEDULED`.
Display status (computed on read by `payment-status.ts` with `today` in the user's timezone):

```
PAID / SKIPPED / RESCHEDULED                 → as stored
days = dueDate − today
days < 0                                     → OVERDUE (even if partially paid; shows remaining)
PARTIALLY_PAID                               → PARTIALLY_PAID
days = 0                                     → DUE_TODAY
1 ≤ days ≤ urgentDays (2)                    → URGENT
urgentDays < days ≤ dueSoonDays (7)          → DUE_SOON
otherwise                                    → UPCOMING
```

Overdue is never stored, so it can never be stale.

## 2. Schedule versioning

**Goal:** never destroy history (SPEC §52), always have exactly one current schedule, and keep payments attached to the line they actually paid.

**Model:** a `DebtScheduleVersion` is an immutable header (`version`, `reason`, `effectiveFrom`). `DebtScheduleItem` rows belong to the version that created them and carry `isCurrent` and `supersededByVersionId`.

**Regeneration algorithm** (early repayment, manual edit, bank import, restructure, correction):

1. Lock the debt row (`SELECT … FOR UPDATE`).
2. Determine the **frozen prefix**: current items that are `PAID`, `PARTIALLY_PAID` or `SKIPPED`, or have any non-reversed payment. These are never modified by regeneration.
3. Compute new lines for the remaining horizon from `currentPrincipal` using the pure engine (or take them from the user/bank import).
4. Insert `DebtScheduleVersion(version = max + 1, reason, effectiveFrom = first new due date)`.
5. Mark the remaining current items `isCurrent = false, supersededByVersionId = newVersion.id`.
6. Insert new items (`isCurrent = true`, installment numbers continue after the frozen prefix).
7. Point `Debt.activeScheduleVersionId` at the new version, update `currentProjectedEndDate`, write `AuditLog(SCHEDULE_REGENERATED, {from, to, reason})`.

All in one DB transaction. The partial unique index `(debtId, installmentNumber) WHERE isCurrent` guarantees two regenerations can't both leave current rows.

**Reading:**

- *Current schedule* = `WHERE debtId = ? AND isCurrent ORDER BY dueDate, installmentNumber`.
- *Schedule as of version v* = items with `version(item) ≤ v AND (supersededBy IS NULL OR version(supersededBy) > v)`. This powers the "compare with previous schedule" view and early-repayment before/after.

**Bank schedule overrides estimates (SPEC §17):** a `BANK_IMPORT` or `MANUAL_EDIT` version creates items with `isEstimate = false`. The UI labels estimate-derived numbers ("Estimated interest") differently from bank-confirmed ones.

## 3. Recording a payment (transaction-safe)

`recordDebtPayment(userId, input)` — all steps inside one `prisma.$transaction` (default `READ COMMITTED` plus explicit row locks):

1. **Idempotency:** if a `DebtPayment` with `(userId, clientRequestId)` exists, return it (a double-click or retried request cannot pay twice). The unique index is the real guard; the lookup just makes the retry return success.
2. **Lock and load, scoped by user:** `SELECT … FROM "Debt" WHERE id = $1 AND "userId" = $2 FOR UPDATE`; then the schedule item (same debt, same user, current) and the account (same user, not archived, **same currency** as the debt). Missing → `NotFound` (never "forbidden" — don't leak existence).
3. **Validate** the breakdown with `payment-allocation.ts` (invariants in §1.6; principal ≤ currentPrincipal).
4. **Insert `DebtPayment`.**
5. **Insert the linked `Transaction`** (`type = DEBT_PAYMENT`, `direction = OUTFLOW`, `amount = actualAccountDebit`, `debtPaymentId`, system category "Debt Payments").
6. **Update the account** with an atomic `currentBalance = currentBalance − debit` (`UPDATE … SET` with `decrement`, not read-modify-write).
7. **Update the schedule item:** add to `paid*` columns; status = `PAID` if `paidTotal ≥ plannedTotal` else `PARTIALLY_PAID`.
8. **Update the debt:** `currentPrincipal −= principalAmount` (the DB check rejects < 0); if it reaches 0 → `status = PAID_OFF`.
9. **Early repayment only:** run the regeneration algorithm (§2) with reason `EARLY_REPAYMENT`, store `resultingScheduleVersionId` on the payment.
10. **Audit:** `PAYMENT_RECORDED` / `EARLY_REPAYMENT` with ids and amounts (no free-text notes).
11. **Commit.** Progress and cost analytics are computed from these rows on read — no separate "recalculate" step can be forgotten.

If any step throws, Postgres rolls everything back: there is no state where the account moved but the debt didn't.

**Concurrency:** the debt row lock serialises payments per debt; account updates are atomic increments so concurrent expenses on the same card are safe; Prisma transaction `timeout` is set explicitly (10 s) and serialisation failures are retried once.

## 4. Partial payments (SPEC §23)

A payment smaller than the item's remaining amount leaves it `PARTIALLY_PAID`; the UI shows *Expected / Paid / Remaining*. A later payment against the same `scheduleItemId` completes it. Overpayment of an item is rejected unless flagged as early repayment (the extra is then principal-only and triggers §2).

## 5. Early repayment (SPEC §24)

1. User enters the extra amount, account, strategy (default **Reduce term**).
2. Preview (pure, no writes): `early-repayment.ts` returns the new future lines plus *old payoff date, new payoff date, months reduced, principal reduced, estimated interest saved*.
3. Confirm → `recordDebtPayment` with `isEarlyRepayment = true`, all of it principal (plus an optional processing fee) → regeneration with reason `EARLY_REPAYMENT`.
4. For interest-bearing loans the savings are labelled *estimate* until a bank schedule is imported.

Reduce term: keep the per-period principal (differential) or payment (annuity) and shorten `n`. Reduce payment: keep the end date, recompute with the lower balance.

## 6. Reversal (SPEC §25)

`reversePayment(userId, paymentId, reason)` — one DB transaction, mirroring §3:

1. Lock the debt; load the payment scoped by user; reject if already reversed.
2. **Last-in-first-out rule for early repayments:** an early repayment can only be reversed if no later schedule version exists; otherwise the user must reverse later changes first (keeps version history linear and explainable).
3. Set `DebtPayment.reversedAt/reversalReason` (the payment row stays).
4. Void the linked `Transaction` (`voidedAt`, `voidReason`) and apply `currentBalance += actualAccountDebit`.
5. Subtract the amounts from the schedule item's `paid*` columns; recompute its stored status (`SCHEDULED` / `PARTIALLY_PAID`).
6. `currentPrincipal += principalAmount`; if the debt was `PAID_OFF`, set it back to `ACTIVE`.
7. If the payment was an early repayment: create a new version with reason `CORRECTION`, regenerated from the restored principal (the early-repayment version stays in history).
8. `AuditLog(PAYMENT_REVERSED, { paymentId, reason, amounts })`.
9. Commit.

## 7. Recompute functions (integrity)

Each denormalised value has a pure recompute from source facts, used in integration tests after every scenario and, later, by a nightly integrity check:

```
account.currentBalance  = openingBalance + Σ inflow − Σ outflow   (actual, non-voided)
debt.currentPrincipal   = principalBasis − paidBeforeTracking − Σ principalAmount (non-reversed)
item.paidTotal          = Σ amountAppliedToDebt of non-reversed payments on the item
```

## 8. Test plan (Phase 2 gate)

Unit (pure): differential (SPEC 85,800,000 example, 30/360 and Actual/365), annuity (known reference values, r = 0), zero-interest installment (Debt B: remaining 113,606,733.37, progress 30.56%), microloan in all four fee modes + known total repayment, processing fee (debit 2,115,000 > applied 2,100,000), rounding residual, `roundingScale = 0`, leap year (29 Feb due dates, Actual/Actual), month-end clamping (31st → 30th/28th), decimal precision (`49,986,962.63` round-trips exactly), status thresholds, fully paid debt.

Integration (Postgres): record → reverse returns every balance to its original value; partial then completing payment; early repayment creates version 2 and preserves version 1; concurrent double submit with the same `clientRequestId` records one payment; cross-user payment attempt returns NotFound; recompute functions equal stored values after each scenario.
