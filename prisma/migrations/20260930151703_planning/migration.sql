-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RecurringKind" AS ENUM ('EXPENSE', 'INCOME');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "occurrenceDate" DATE,
ADD COLUMN     "recurringId" TEXT;

-- CreateTable
CREATE TABLE "RecurringTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RecurringKind" NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isSubscription" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromCurrency" "Currency" NOT NULL,
    "toCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringTransaction_userId_isActive_idx" ON "RecurringTransaction"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Budget_userId_year_month_idx" ON "Budget"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "ExchangeRate_userId_fromCurrency_toCurrency_idx" ON "ExchangeRate"("userId", "fromCurrency", "toCurrency");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_userId_fromCurrency_toCurrency_effectiveDate_key" ON "ExchangeRate"("userId", "fromCurrency", "toCurrency", "effectiveDate");

-- CreateIndex
CREATE INDEX "Transaction_recurringId_idx" ON "Transaction"("recurringId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---- Integrity constraints Prisma cannot express (docs/database.md section 7) ----

ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "recurring_valid" CHECK (
  "amount" > 0 AND "interval" BETWEEN 1 AND 60 AND ("endDate" IS NULL OR "endDate" >= "startDate")
);

ALTER TABLE "Budget" ADD CONSTRAINT "budget_valid" CHECK (
  "amount" > 0 AND "month" BETWEEN 1 AND 12 AND "year" BETWEEN 2000 AND 2200
);
-- One budget per month and currency: overall (no category) and per category.
CREATE UNIQUE INDEX "budget_category_unique" ON "Budget" ("userId", "year", "month", "currency", "categoryId") WHERE "categoryId" IS NOT NULL;
CREATE UNIQUE INDEX "budget_overall_unique" ON "Budget" ("userId", "year", "month", "currency") WHERE "categoryId" IS NULL;

ALTER TABLE "ExchangeRate" ADD CONSTRAINT "exchange_rate_valid" CHECK ("rate" > 0 AND "fromCurrency" <> "toCurrency");

-- A recurring occurrence is recorded at most once (voided rows do not count).
CREATE UNIQUE INDEX "transaction_recurring_occurrence_unique"
  ON "Transaction" ("recurringId", "occurrenceDate") WHERE "voidedAt" IS NULL AND "recurringId" IS NOT NULL;
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_recurring_has_date" CHECK ("recurringId" IS NULL OR "occurrenceDate" IS NOT NULL);
