-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('CREDIT', 'CAR_LOAN', 'INSTALLMENT', 'MICROLOAN', 'CREDIT_CARD', 'MORTGAGE', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RepaymentType" AS ENUM ('DIFFERENTIAL', 'ANNUITY', 'INTEREST_FREE', 'MANUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeeMode" AS ENUM ('NONE', 'ADDED_ON_TOP', 'DEDUCTED_FROM_DISBURSEMENT', 'FINANCED_INTO_DEBT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DayCountConvention" AS ENUM ('MONTHLY_30_360', 'ACTUAL_365', 'ACTUAL_360', 'ACTUAL_ACTUAL');

-- CreateEnum
CREATE TYPE "ScheduleVersionReason" AS ENUM ('INITIAL', 'MANUAL_EDIT', 'BANK_IMPORT', 'EARLY_REPAYMENT', 'RESTRUCTURE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "ScheduleItemStatus" AS ENUM ('SCHEDULED', 'PARTIALLY_PAID', 'PAID', 'SKIPPED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "EarlyRepaymentStrategy" AS ENUM ('REDUCE_TERM', 'REDUCE_PAYMENT');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "debtId" TEXT,
ADD COLUMN     "debtPaymentId" TEXT;

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lender" TEXT,
    "type" "DebtType" NOT NULL,
    "repaymentType" "RepaymentType" NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "originalPrincipal" DECIMAL(20,2) NOT NULL,
    "principalBasis" DECIMAL(20,2) NOT NULL,
    "currentPrincipal" DECIMAL(20,2) NOT NULL,
    "paidBeforeTracking" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "netAmountReceived" DECIMAL(20,2),
    "annualInterestRate" DECIMAL(9,6),
    "dayCountConvention" "DayCountConvention" NOT NULL DEFAULT 'MONTHLY_30_360',
    "roundingScale" INTEGER NOT NULL DEFAULT 2,
    "feeMode" "FeeMode" NOT NULL DEFAULT 'NONE',
    "originationFeeAmount" DECIMAL(20,2),
    "contractTotalRepayment" DECIMAL(20,2),
    "knownTotalRepayment" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "firstPaymentDate" DATE,
    "paymentDay" INTEGER,
    "originalTermMonths" INTEGER,
    "currentProjectedEndDate" DATE,
    "activeScheduleVersionId" TEXT,
    "disbursementAccountId" TEXT,
    "notes" TEXT,
    "clientRequestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtScheduleVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" "ScheduleVersionReason" NOT NULL,
    "note" TEXT,
    "effectiveFrom" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtScheduleItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "scheduleVersionId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "openingPrincipal" DECIMAL(20,2) NOT NULL,
    "plannedPrincipal" DECIMAL(20,2) NOT NULL,
    "plannedInterest" DECIMAL(20,2) NOT NULL,
    "plannedFees" DECIMAL(20,2) NOT NULL,
    "plannedTotal" DECIMAL(20,2) NOT NULL,
    "closingPrincipal" DECIMAL(20,2) NOT NULL,
    "paidPrincipal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "paidInterest" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "paidFees" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "paidTotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" "ScheduleItemStatus" NOT NULL DEFAULT 'SCHEDULED',
    "isEstimate" BOOLEAN NOT NULL DEFAULT true,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersededByVersionId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DebtScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "scheduleItemId" TEXT,
    "accountId" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "amountAppliedToDebt" DECIMAL(20,2) NOT NULL,
    "actualAccountDebit" DECIMAL(20,2) NOT NULL,
    "principalAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "interestAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "originationFeeAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "paymentProcessingFeeAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "penaltyAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "otherFeeAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "isEarlyRepayment" BOOLEAN NOT NULL DEFAULT false,
    "earlyRepaymentStrategy" "EarlyRepaymentStrategy",
    "resultingScheduleVersionId" TEXT,
    "note" TEXT,
    "clientRequestId" TEXT,
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Debt_activeScheduleVersionId_key" ON "Debt"("activeScheduleVersionId");

-- CreateIndex
CREATE INDEX "Debt_userId_status_idx" ON "Debt"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_userId_clientRequestId_key" ON "Debt"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "DebtScheduleVersion_userId_debtId_idx" ON "DebtScheduleVersion"("userId", "debtId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtScheduleVersion_debtId_version_key" ON "DebtScheduleVersion"("debtId", "version");

-- CreateIndex
CREATE INDEX "DebtScheduleItem_userId_dueDate_status_idx" ON "DebtScheduleItem"("userId", "dueDate", "status");

-- CreateIndex
CREATE INDEX "DebtScheduleItem_debtId_isCurrent_dueDate_idx" ON "DebtScheduleItem"("debtId", "isCurrent", "dueDate");

-- CreateIndex
CREATE INDEX "DebtScheduleItem_scheduleVersionId_idx" ON "DebtScheduleItem"("scheduleVersionId");

-- CreateIndex
CREATE INDEX "DebtPayment_userId_paymentDate_idx" ON "DebtPayment"("userId", "paymentDate");

-- CreateIndex
CREATE INDEX "DebtPayment_debtId_reversedAt_idx" ON "DebtPayment"("debtId", "reversedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DebtPayment_userId_clientRequestId_key" ON "DebtPayment"("userId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_debtPaymentId_key" ON "Transaction"("debtPaymentId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_debtPaymentId_fkey" FOREIGN KEY ("debtPaymentId") REFERENCES "DebtPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_disbursementAccountId_fkey" FOREIGN KEY ("disbursementAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_activeScheduleVersionId_fkey" FOREIGN KEY ("activeScheduleVersionId") REFERENCES "DebtScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtScheduleVersion" ADD CONSTRAINT "DebtScheduleVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtScheduleVersion" ADD CONSTRAINT "DebtScheduleVersion_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtScheduleItem" ADD CONSTRAINT "DebtScheduleItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtScheduleItem" ADD CONSTRAINT "DebtScheduleItem_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtScheduleItem" ADD CONSTRAINT "DebtScheduleItem_scheduleVersionId_fkey" FOREIGN KEY ("scheduleVersionId") REFERENCES "DebtScheduleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtScheduleItem" ADD CONSTRAINT "DebtScheduleItem_supersededByVersionId_fkey" FOREIGN KEY ("supersededByVersionId") REFERENCES "DebtScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "DebtScheduleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_resultingScheduleVersionId_fkey" FOREIGN KEY ("resultingScheduleVersionId") REFERENCES "DebtScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---- Integrity constraints Prisma cannot express (docs/database.md section 6) ----

ALTER TABLE "Debt" ADD CONSTRAINT "debt_amounts_valid" CHECK (
  "originalPrincipal" > 0 AND "principalBasis" > 0 AND "paidBeforeTracking" >= 0 AND
  "currentPrincipal" >= 0 AND "currentPrincipal" <= "principalBasis" AND
  ("netAmountReceived" IS NULL OR "netAmountReceived" >= 0) AND
  ("originationFeeAmount" IS NULL OR "originationFeeAmount" >= 0) AND
  ("contractTotalRepayment" IS NULL OR "contractTotalRepayment" >= 0) AND
  ("annualInterestRate" IS NULL OR "annualInterestRate" >= 0)
);
ALTER TABLE "Debt" ADD CONSTRAINT "debt_dates_valid" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "Debt" ADD CONSTRAINT "debt_payment_day_valid" CHECK ("paymentDay" IS NULL OR "paymentDay" BETWEEN 1 AND 31);
ALTER TABLE "Debt" ADD CONSTRAINT "debt_rounding_scale_valid" CHECK ("roundingScale" IN (0, 2));

ALTER TABLE "DebtScheduleItem" ADD CONSTRAINT "schedule_item_amounts_valid" CHECK (
  "openingPrincipal" >= 0 AND "plannedPrincipal" >= 0 AND "plannedInterest" >= 0 AND "plannedFees" >= 0 AND
  "closingPrincipal" >= 0 AND
  "plannedTotal" = "plannedPrincipal" + "plannedInterest" + "plannedFees" AND
  "closingPrincipal" = "openingPrincipal" - "plannedPrincipal" AND
  "paidPrincipal" >= 0 AND "paidInterest" >= 0 AND "paidFees" >= 0 AND
  "paidTotal" = "paidPrincipal" + "paidInterest" + "paidFees"
);
-- Exactly one current line per installment number of a debt.
CREATE UNIQUE INDEX "schedule_item_current_installment"
  ON "DebtScheduleItem" ("debtId", "installmentNumber") WHERE "isCurrent";

ALTER TABLE "DebtPayment" ADD CONSTRAINT "payment_components_non_negative" CHECK (
  "principalAmount" >= 0 AND "interestAmount" >= 0 AND "originationFeeAmount" >= 0 AND
  "paymentProcessingFeeAmount" >= 0 AND "penaltyAmount" >= 0 AND "otherFeeAmount" >= 0
);
ALTER TABLE "DebtPayment" ADD CONSTRAINT "payment_applied_equals_breakdown" CHECK (
  "amountAppliedToDebt" = "principalAmount" + "interestAmount" + "originationFeeAmount" + "penaltyAmount" + "otherFeeAmount"
);
ALTER TABLE "DebtPayment" ADD CONSTRAINT "payment_debit_equals_applied_plus_processing" CHECK (
  "actualAccountDebit" = "amountAppliedToDebt" + "paymentProcessingFeeAmount"
);
ALTER TABLE "DebtPayment" ADD CONSTRAINT "payment_positive" CHECK ("actualAccountDebit" > 0);

ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_debt_payment_linked" CHECK (
  ("type" = 'DEBT_PAYMENT') = ("debtPaymentId" IS NOT NULL)
);
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_debt_rows_have_debt" CHECK (
  "type" NOT IN ('DEBT_PAYMENT', 'LOAN_DISBURSEMENT') OR "debtId" IS NOT NULL
);
