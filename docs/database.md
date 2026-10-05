# Fyndue — Database Design

> PostgreSQL 16 + Prisma 7. The live schema is `prisma/schema.prisma`; this document is the full target design across all phases and explains *why*. Models marked **(Phase N)** are designed here but not yet in the schema.

## 1. Conventions

- **IDs:** `String @id @default(cuid(2))`-style text IDs (Better Auth's tables use its own string IDs). Non-guessable, URL-safe.
- **Ownership:** every user-owned table has `userId` with `onDelete: Cascade` and an index leading with `userId`. There is no query path that loads a user-owned row without `userId` in the predicate (see [security.md](security.md)).
- **Money:** `Decimal @db.Decimal(20, 2)`. Rates: `@db.Decimal(9, 6)` (annual %, e.g. `24.500000`). FX: `@db.Decimal(20, 8)`.
- **Currency:** `Currency` enum (`UZS`, `USD`, `EUR`, `RUB`), stored on every amount-bearing row.
- **Business dates:** `DateTime @db.Date` (no time, no zone). **Instants:** `DateTime @db.Timestamptz(3)`.
- **No hard deletes of financial facts.** Transactions are *voided*, payments are *reversed*, schedules are *superseded*. Accounts and categories are *archived*.
- **Denormalised balances** (`Account.currentBalance`, `Debt.currentPrincipal`, schedule-item paid amounts) are updated only inside the same DB transaction as the fact that changes them, and every one has a recompute function used by tests and a future integrity job.
- **Check constraints** that Prisma cannot express are added as raw SQL in migrations (listed per model).

## 2. Entity overview

```
User ─┬─ UserSettings (1:1)
      ├─ Session / AuthAccount / Verification      (Better Auth)
      ├─ Account ──────────────┐
      ├─ Category              │
      ├─ Transaction ──────────┤ accountId, categoryId?, debtPaymentId?, transferGroupId?
      ├─ Debt ─┬─ DebtScheduleVersion ─ DebtScheduleItem
      │        └─ DebtPayment ─ (1:1) Transaction
      ├─ Budget
      ├─ RecurringTransaction
      ├─ ExchangeRate (manual)
      ├─ NotificationPreference (1:1), TelegramConnection (1:1), NotificationLog
      ├─ Document
      └─ AuditLog
```

## 3. Enums

```prisma
enum Currency        { UZS USD EUR RUB }
enum Theme           { LIGHT DARK SYSTEM }
enum AccountType     { BANK_CARD CASH SAVINGS DEPOSIT DIGITAL_WALLET OTHER }
enum CategoryType    { EXPENSE INCOME }
enum TransactionType { EXPENSE INCOME TRANSFER DEBT_PAYMENT BALANCE_ADJUSTMENT LOAN_DISBURSEMENT }
enum FlowDirection   { INFLOW OUTFLOW }
enum TransactionStatus { ACTUAL EXPECTED }   // expected income is never counted as actual
enum TransactionSource { MANUAL IMPORT BANK_SYNC OCR SYSTEM }

// Phase 2
enum DebtType        { CREDIT CAR_LOAN INSTALLMENT MICROLOAN CREDIT_CARD MORTGAGE PERSONAL OTHER }
enum RepaymentType   { DIFFERENTIAL ANNUITY INTEREST_FREE MANUAL CUSTOM }
enum DebtStatus      { ACTIVE PAID_OFF ARCHIVED }
enum FeeMode         { NONE ADDED_ON_TOP DEDUCTED_FROM_DISBURSEMENT FINANCED_INTO_DEBT CUSTOM }
enum DayCountConvention { MONTHLY_30_360 ACTUAL_365 ACTUAL_360 ACTUAL_ACTUAL }
enum ScheduleVersionReason { INITIAL MANUAL_EDIT BANK_IMPORT EARLY_REPAYMENT RESTRUCTURE CORRECTION }
enum ScheduleItemStatus { SCHEDULED PARTIALLY_PAID PAID SKIPPED RESCHEDULED }
enum EarlyRepaymentStrategy { REDUCE_TERM REDUCE_PAYMENT }

// Phase 4–6
enum RecurrenceFrequency { WEEKLY MONTHLY YEARLY }
enum NotificationType    { DUE_IN_DAYS DUE_TODAY OVERDUE }
enum NotificationChannel { TELEGRAM IN_APP }
enum NotificationStatus  { PENDING SENT FAILED SKIPPED CANCELLED }
enum TelegramConnectionStatus { PENDING CONNECTED DISCONNECTED }
enum DocumentType    { LOAN_AGREEMENT PAYMENT_RECEIPT BANK_SCHEDULE OTHER }
```

Why `LOAN_DISBURSEMENT` (not in the SPEC's list): when a microloan pays `1,900,000` into a card, the account balance must go up, but this is not income. A dedicated type keeps the account engine truthful while income analytics exclude it.

Why `FlowDirection`: storing `amount` as a positive number plus an explicit direction makes the balance formula uniform for all types — `balance = opening + Σ inflow − Σ outflow` — and removes sign ambiguity for transfers and adjustments.

## 4. Identity & settings (Phase 1)

```prisma
model User {
  id            String   @id
  email         String   @unique
  emailVerified Boolean  @default(false)
  phoneNumber         String?  @unique          // E.164, set by phone sign-in or linked in the bot
  phoneNumberVerified Boolean? @default(false)
  name          String
  image         String?
  baseCurrency  Currency @default(UZS)
  timezone      String   @default("Asia/Tashkent")
  createdAt     DateTime @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime @updatedAt @db.Timestamptz(3)
  // relations …
}

model UserSettings {
  id               String   @id @default(cuid())
  userId           String   @unique
  theme            Theme    @default(SYSTEM)
  locale           String   @default("en-US")
  defaultAccountId String?
  weekStartsOn     Int      @default(1)       // 0 = Sunday, 1 = Monday
  dueSoonDays      Int      @default(7)       // SPEC §12 thresholds, configurable
  urgentDays       Int      @default(2)
  createdAt, updatedAt
}
```

Better Auth tables (`Session`, `AuthAccount` → mapped to `account`, `Verification`) are generated to Better Auth's shape. The auth "account" model is renamed `AuthAccount` so it does not clash with the financial `Account`. Password hashes live in `AuthAccount.password` and are written only by Better Auth.

Phone sign-in (docs/telegram.md §9): accounts created by phone get a placeholder email `<digits>@phone.fyndue.uz` (Better Auth requires one); the UI shows the formatted number instead. Codes live in `Verification` (`identifier` = phone, `value` = `code:attempts`).

## 5. Accounts, categories, transactions (Phase 1)

```prisma
model Account {
  id             String      @id @default(cuid())
  userId         String
  name           String
  type           AccountType
  currency       Currency
  openingBalance Decimal     @db.Decimal(20, 2)
  currentBalance Decimal     @db.Decimal(20, 2)
  includeInTotal Boolean     @default(true)
  bank           String?
  icon           String?
  color          String?
  sortOrder      Int         @default(0)
  isArchived     Boolean     @default(false)
  createdAt, updatedAt
  @@index([userId, isArchived])
}

model Category {
  id         String       @id @default(cuid())
  userId     String
  name       String
  type       CategoryType
  icon       String       // lucide icon key from an allow-list
  color      String?      // token name from an allow-list, not raw CSS
  isDefault  Boolean      @default(false)
  isSystem   Boolean      @default(false)   // e.g. "Debt Payments": cannot be archived
  isArchived Boolean      @default(false)
  sortOrder  Int          @default(0)
  createdAt, updatedAt
  @@unique([userId, type, name])
  @@index([userId, type, isArchived, sortOrder])
}

model Transaction {
  id              String            @id @default(cuid())
  userId          String
  accountId       String
  categoryId      String?
  type            TransactionType
  direction       FlowDirection
  status          TransactionStatus @default(ACTUAL)
  amount          Decimal           @db.Decimal(20, 2)   // > 0, the real account movement
  currency        Currency                               // = account.currency
  transactionDate DateTime          @db.Date
  merchant        String?
  note            String?
  transferGroupId String?           // both legs of a transfer share it
  debtId          String?           // DEBT_PAYMENT and LOAN_DISBURSEMENT rows
  debtPaymentId   String?  @unique  // 1:1 with DebtPayment
  source          TransactionSource @default(MANUAL)
  externalId      String?           // future import dedup
  clientRequestId String?           // idempotency key from the form
  voidedAt        DateTime?         @db.Timestamptz(3)
  voidReason      String?
  createdAt, updatedAt

  @@unique([userId, clientRequestId])
  @@index([userId, transactionDate])
  @@index([userId, accountId])
  @@index([userId, categoryId])
  @@index([transferGroupId])
}
```

SQL checks (migration):

```sql
ALTER TABLE "Transaction" ADD CONSTRAINT transaction_amount_positive CHECK (amount > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT transaction_direction_matches_type CHECK (
  (type = 'EXPENSE'           AND direction = 'OUTFLOW') OR
  (type = 'INCOME'            AND direction = 'INFLOW')  OR
  (type = 'DEBT_PAYMENT'      AND direction = 'OUTFLOW') OR
  (type = 'LOAN_DISBURSEMENT' AND direction = 'INFLOW')  OR
  (type IN ('TRANSFER','BALANCE_ADJUSTMENT'))
);
ALTER TABLE "Transaction" ADD CONSTRAINT transaction_transfer_has_group CHECK (
  (type = 'TRANSFER') = ("transferGroupId" IS NOT NULL)
);
```

Semantics:

- **Balance:** `currentBalance = openingBalance + Σ(inflow) − Σ(outflow)` over rows with `voidedAt IS NULL AND status = 'ACTUAL'`. `EXPECTED` income never moves a balance until confirmed (confirmation flips `status` and applies the delta in one transaction).
- **Transfers:** exactly two rows, one `OUTFLOW` from the source, one `INFLOW` to the destination, same `transferGroupId`. Amounts may differ for cross-currency transfers (each in its own account currency — this *is* the explicit conversion). Voiding voids both legs. Transfers are excluded from income/expense analytics.
- **Voiding:** sets `voidedAt`/`voidReason` and applies the opposite balance delta. Voided rows are shown struck-through in history and excluded from analytics. `DEBT_PAYMENT` rows can only be voided through *Reverse Payment* (Phase 2).
- **Monthly summaries** are computed from these rows at query time, so history is always reproducible (SPEC §39).

## 6. Debts (implemented in Phase 2)

```prisma
model Debt {
  id                     String        @id @default(cuid())
  userId                 String
  name                   String
  lender                 String?
  type                   DebtType
  repaymentType          RepaymentType
  currency               Currency
  status                 DebtStatus    @default(ACTIVE)

  originalPrincipal      Decimal @db.Decimal(20, 2) // contract/requested principal (the progress denominator)
  principalBasis         Decimal @db.Decimal(20, 2) // = original, or original + fee when FINANCED_INTO_DEBT
  currentPrincipal       Decimal @db.Decimal(20, 2) // denormalised, >= 0
  paidBeforeTracking     Decimal @db.Decimal(20, 2) @default(0) // SPEC "alreadyPaid": principal repaid before Fyndue, no account movement
  netAmountReceived      Decimal? @db.Decimal(20, 2)

  annualInterestRate     Decimal? @db.Decimal(9, 6)  // percent
  dayCountConvention     DayCountConvention @default(MONTHLY_30_360)
  roundingScale          Int      @default(2)        // 0 for lenders that round to whole sums
  feeMode                FeeMode  @default(NONE)
  originationFeeAmount   Decimal? @db.Decimal(20, 2)
  contractTotalRepayment Decimal? @db.Decimal(20, 2)
  knownTotalRepayment    Boolean  @default(false)    // SPEC §19A: never invent an interest split

  startDate              DateTime  @db.Date
  endDate                DateTime? @db.Date
  paymentDay             Int?                        // 1–31, clamped to month length
  originalTermMonths     Int?
  currentProjectedEndDate DateTime? @db.Date
  activeScheduleVersionId String?  @unique
  disbursementAccountId  String?                     // where the money landed, if tracked
  notes                  String?
  createdAt, updatedAt
  @@index([userId, status])
}

model DebtScheduleVersion {
  id            String   @id @default(cuid())
  userId        String
  debtId        String
  version       Int                          // 1, 2, 3 … per debt
  reason        ScheduleVersionReason
  note          String?
  effectiveFrom DateTime @db.Date            // first due date this version (re)defines
  createdAt     DateTime @default(now()) @db.Timestamptz(3)
  @@unique([debtId, version])
}

model DebtScheduleItem {
  id                    String             @id @default(cuid())
  userId                String
  debtId                String
  scheduleVersionId     String
  installmentNumber     Int
  dueDate               DateTime           @db.Date
  openingPrincipal      Decimal @db.Decimal(20, 2)
  plannedPrincipal      Decimal @db.Decimal(20, 2)
  plannedInterest       Decimal @db.Decimal(20, 2)
  plannedFees           Decimal @db.Decimal(20, 2)
  plannedTotal          Decimal @db.Decimal(20, 2)
  closingPrincipal      Decimal @db.Decimal(20, 2)
  paidPrincipal         Decimal @db.Decimal(20, 2) @default(0)  // denormalised from payments
  paidInterest          Decimal @db.Decimal(20, 2) @default(0)
  paidFees              Decimal @db.Decimal(20, 2) @default(0)
  paidTotal             Decimal @db.Decimal(20, 2) @default(0)
  status                ScheduleItemStatus @default(SCHEDULED)
  isEstimate            Boolean            @default(true)  // false once from a bank schedule
  isCurrent             Boolean            @default(true)
  supersededByVersionId String?
  createdAt, updatedAt
  @@index([userId, dueDate, status])
  @@index([debtId, isCurrent, dueDate])
}

model DebtPayment {
  id                          String   @id @default(cuid())
  userId                      String
  debtId                      String
  scheduleItemId              String?
  accountId                   String
  paymentDate                 DateTime @db.Date
  amountAppliedToDebt         Decimal @db.Decimal(20, 2)
  actualAccountDebit          Decimal @db.Decimal(20, 2)
  principalAmount             Decimal @db.Decimal(20, 2) @default(0)
  interestAmount              Decimal @db.Decimal(20, 2) @default(0)
  originationFeeAmount        Decimal @db.Decimal(20, 2) @default(0)
  paymentProcessingFeeAmount  Decimal @db.Decimal(20, 2) @default(0)
  penaltyAmount               Decimal @db.Decimal(20, 2) @default(0)
  otherFeeAmount              Decimal @db.Decimal(20, 2) @default(0)
  isEarlyRepayment            Boolean  @default(false)
  earlyRepaymentStrategy      EarlyRepaymentStrategy?
  resultingScheduleVersionId  String?   // the version created by an early repayment
  note                        String?
  clientRequestId             String?
  reversedAt                  DateTime? @db.Timestamptz(3)
  reversalReason              String?
  createdAt, updatedAt
  @@unique([userId, clientRequestId])
  @@index([userId, paymentDate])
  @@index([debtId, reversedAt])
}
```

SQL checks and indexes (migration):

```sql
-- non-negative money everywhere on Debt / DebtPayment / DebtScheduleItem, e.g.
ALTER TABLE "Debt" ADD CONSTRAINT debt_principal_non_negative CHECK ("currentPrincipal" >= 0);
ALTER TABLE "Debt" ADD CONSTRAINT debt_dates CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "DebtPayment" ADD CONSTRAINT payment_components_non_negative CHECK (
  "principalAmount" >= 0 AND "interestAmount" >= 0 AND "originationFeeAmount" >= 0 AND
  "paymentProcessingFeeAmount" >= 0 AND "penaltyAmount" >= 0 AND "otherFeeAmount" >= 0);
ALTER TABLE "DebtPayment" ADD CONSTRAINT payment_applied_equals_breakdown CHECK (
  "amountAppliedToDebt" = "principalAmount" + "interestAmount" + "originationFeeAmount"
                        + "penaltyAmount" + "otherFeeAmount");
ALTER TABLE "DebtPayment" ADD CONSTRAINT payment_debit_equals_applied_plus_processing CHECK (
  "actualAccountDebit" = "amountAppliedToDebt" + "paymentProcessingFeeAmount");
ALTER TABLE "DebtPayment" ADD CONSTRAINT payment_positive CHECK ("actualAccountDebit" > 0);
-- only one live item per installment number in the current schedule
CREATE UNIQUE INDEX schedule_item_current_installment
  ON "DebtScheduleItem" ("debtId", "installmentNumber") WHERE "isCurrent";
```

The two equality checks make SPEC §53's "actual account debit inconsistent with the validated payment breakdown" and "processing fee applied to principal" impossible at the database level, not just in code.

As built, `Debt` also stores `firstPaymentDate` (the first tracked due date) and `clientRequestId` (unique per user, for idempotent creation). The live definitions are in `prisma/schema.prisma` and `prisma/migrations/*_debt_engine/migration.sql`. The migration also adds `debt_amounts_valid`, `schedule_item_amounts_valid` (planned total and paid total add up; closing = opening − principal), `transaction_debt_payment_linked` (a `DEBT_PAYMENT` transaction always has its `DebtPayment`) and `transaction_debt_rows_have_debt`.

Versioning, allocation and reversal semantics are in [debt-engine.md](debt-engine.md).

## 7. Budgets, recurring, FX (implemented in Phase 4)

```prisma
model Budget {
  id         String   @id @default(cuid())
  userId     String
  categoryId String?            // null = overall monthly budget
  year       Int
  month      Int                // 1–12
  amount     Decimal  @db.Decimal(20, 2)
  currency   Currency
  createdAt, updatedAt
  @@unique([userId, year, month, categoryId, currency])  // + partial unique index for NULL categoryId
  @@index([userId, year, month])
}

model RecurringTransaction {
  id, userId, accountId, categoryId?, type, amount, currency,
  frequency RecurrenceFrequency, interval Int, dayOfMonth Int?,
  startDate @db.Date, endDate @db.Date?, nextOccurrence @db.Date,
  isSubscription Boolean, isActive Boolean, note?, createdAt, updatedAt
  @@index([userId, nextOccurrence])
}

model ExchangeRate {        // the user's own rates; win over CBU on the same date
  id, userId, fromCurrency, toCurrency, rate Decimal(20,8), effectiveDate @db.Date, createdAt
  @@unique([userId, fromCurrency, toCurrency, effectiveDate])
}
```

Recurring items feed the calendar and cash-flow forecast as *planned* events; they never create actual transactions without user confirmation.

As built: `RecurringTransaction` has `name` and `kind` (EXPENSE | INCOME) and no stored `nextOccurrence` (occurrences are computed by `lib/finance/recurrence.ts`). `Transaction.recurringId` + `occurrenceDate` link a recorded occurrence, with a partial unique index `WHERE voidedAt IS NULL`. Budgets use two partial unique indexes: one for category budgets and one for the overall budget (`categoryId IS NULL`). `ExchangeRate` has `CHECK (rate > 0 AND fromCurrency <> toCurrency)`.

## 8. Notifications & Telegram (implemented in Phase 5)

```prisma
model NotificationPreference {
  id, userId @unique,
  telegramEnabled Boolean @default(true), inAppEnabled Boolean @default(true),
  notifyDaysBefore Int[] @default([7, 3, 1]),
  notifyOnDueDate Boolean @default(true), notifyWhenOverdue Boolean @default(true),
  overdueRepeatDays Int @default(3),
  quietHoursStart String? @default("22:00"), quietHoursEnd String? @default("09:00"),   // user timezone; null = no quiet hours
  createdAt, updatedAt
}

model TelegramConnection {
  id, userId @unique,
  telegramChatId String? @unique, telegramUsername String?,
  connectionCodeHash String? @unique, connectionCodeExpiresAt DateTime?,
  connectedAt DateTime?, status TelegramConnectionStatus, createdAt, updatedAt
}

model TelegramPhone {            // a number confirmed in the bot by sharing the contact
  id, phoneNumber String @unique, chatId String @unique, telegramUserId String, createdAt, updatedAt
}

model NotificationLog {
  id, userId, debtId?, scheduleItemId?,
  type NotificationType, channel NotificationChannel,
  deduplicationKey String @unique,
  scheduledAt DateTime, sentAt DateTime?, status NotificationStatus,
  attempts Int @default(0), externalMessageId String?, failureReason String?,
  createdAt, updatedAt
  @@index([userId, createdAt]) @@index([status, scheduledAt]) @@index([scheduleItemId])
}
```

- Only a *hash* (SHA-256) of the one-time Telegram connection code is stored; linking clears it, so a code works once.
- CHECK constraints: `notification_preference_valid` (`overdueRepeatDays` 1–30, quiet hours `HH:MM`) and `notification_attempts_valid` (`attempts ≥ 0`).
- No preference row means the defaults above; the row is created on the first save.
- `deduplicationKey` is the idempotency lock: the dispatcher inserts it with `ON CONFLICT DO NOTHING` (Prisma `createMany({ skipDuplicates })`) *before* sending. Keys: `due:{itemId}:{dueDate}:d{n}:tg`, `today:{itemId}:{dueDate}:tg`, `overdue:{itemId}:{dueDate}:r{round}:tg`, `test:{userId}:{minute}:tg`.

## 9. Documents & audit

```prisma
model Document {            // Phase 6
  id, userId, debtId?, debtPaymentId?, type DocumentType, name, storageKey @unique,
  mimeType, size Int, sha256 String, createdAt, updatedAt
  @@index([userId, debtId]) @@index([debtPaymentId])
}
```

- `debtId` cascades (a debt's documents go with it), `debtPaymentId` is `SET NULL` (a receipt outlives the payment link).
- CHECK `document_valid`: size 1 B–10 MB, `mimeType` ∈ {PDF, JPEG, PNG}, lowercase hex `sha256`, name 1–120 characters. CHECK `document_payment_needs_debt`: a payment link requires a debt link. The service also checks that the payment belongs to that debt and user.
- Documents are the one user-owned record that is hard-deleted: they are evidence, not financial facts. The `DOCUMENT_DELETED` audit row keeps the type and hash.

```prisma

model AuditLog {            // Phase 1
  id         String   @id @default(cuid())
  userId     String
  action     String   // AuditAction union in code: ACCOUNT_CREATED, TRANSACTION_VOIDED, PAYMENT_RECORDED, …
  entityType String
  entityId   String
  metadata   Json?    // before/after snapshots of changed fields; no secrets, no tokens
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  @@index([userId, createdAt])
  @@index([entityType, entityId])
}
```

`action` is a string validated by a TypeScript union rather than a Postgres enum so new actions don't need a migration. Audit rows are append-only (no update/delete code paths).

## 10. Index summary (SPEC §58)

| Index | Serves |
|---|---|
| `Transaction(userId, transactionDate)` | transaction list, monthly summaries |
| `Transaction(userId, accountId)` | account detail, balance recompute |
| `Transaction(userId, categoryId)` | category analytics, budgets |
| `Debt(userId, status)` | debt tabs |
| `DebtScheduleItem(userId, dueDate, status)` | upcoming payments, calendar, reminders |
| `DebtScheduleItem(debtId, installmentNumber) WHERE isCurrent` | unique current schedule |
| `DebtPayment(userId, paymentDate)` | payment history, analytics |
| `NotificationLog(deduplicationKey)` unique | idempotent reminders |
| `Budget(userId, year, month)` | budget page |
| `AuditLog(userId, createdAt)` | activity history |

## 11. Seed data

`prisma/seed.ts` refuses to run when `NODE_ENV === "production"`. It creates a demo user through Better Auth's API (so the password is hashed by the library), default categories, accounts **Uzcard / Visa / Cash UZS**, and a few Fuel / Taxi / Groceries expenses. It also seeds the SPEC debts: Debt A (85,800,000 differential; the 24% / 36 months terms are demo placeholders until the real contract is entered), Debt B (163,593,696 interest-free installment with 49,986,962.63 already paid, 3,500,000 a month), and a demo microloan (2,000,000 + 100,000 fee on top, repaid with a 15,000 card fee, so 2,115,000 is debited). Re-running the seed adds only what is missing. Real financial data is never hardcoded outside the dev seed.

### CentralBankRate (global, not per user)

Official CBU rates (UZS per 1 unit of USD/EUR/RUB) fetched from `https://cbu.uz/ru/arkhiv-kursov-valyut/json/`. Columns: `currency`, `rate NUMERIC(20,8)`, `rateDate DATE`, `fetchedAt`. `UNIQUE (currency, rateDate)`, `CHECK (rate > 0 AND currency <> 'UZS')`. Shared reference data, so it is the one table not scoped by `userId`; `ratesForUser(userId)` merges it with the user's manual rates.

### RecurringTransaction.url

Optional link to the page where a subscription is managed or cancelled. Saved only when `isSubscription` is true. `CHECK ("url" IS NULL OR ("url" ~* '^https?://' AND length("url") <= 300))`, because it is rendered as a link.

### Weekend shift

`Debt.shiftWeekends` (default false) moves due dates off weekends and public holidays. `DebtScheduleItem.accrualDate` is the contract date interest is counted to when the payment was moved (null when equal to `dueDate`).

### Account.trackingStartDate

First day an account is tracked in Fyndue (set by «Начать учёт заново»). Money before it is in `openingBalance`, so operations dated earlier are refused by the services.

### Templates, goals, shared accounts, receipts

```prisma
model TransactionTemplate { id, userId, name, type (EXPENSE|INCOME), accountId?, categoryId, amount? Decimal(20,2), merchant?, note?, sortOrder }
model SavingsGoal { id, userId, name, icon, color?, targetAmount Decimal(20,2), currency, savedAmount Decimal(20,2) @default(0), accountId?, targetDate? Date, achievedAt?, isArchived }
model AccountShare { id, accountId, ownerId, memberId, createdAt  @@unique([accountId, memberId]) }
Category.parentId String?      // one level of subcategories, SetNull on delete
Transaction.createdById String? // a shared-account member who typed it
Document.transactionId String?  // receipt photo on an operation (cascade)
```

CHECKs: `savings_goal_amounts_valid` (target > 0, saved ≥ 0), `transaction_template_valid` (amount > 0, EXPENSE/INCOME only), `account_share_not_self`, `category_not_own_parent`. A goal linked to an account must share its currency; its progress is the account balance.
