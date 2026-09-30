-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('LOAN_AGREEMENT', 'PAYMENT_RECEIPT', 'BANK_SCHEDULE', 'OTHER');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debtId" TEXT,
    "debtPaymentId" TEXT,
    "type" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_userId_debtId_idx" ON "Document"("userId", "debtId");

-- CreateIndex
CREATE INDEX "Document_debtPaymentId_idx" ON "Document"("debtPaymentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_debtPaymentId_fkey" FOREIGN KEY ("debtPaymentId") REFERENCES "DebtPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- Integrity constraints (docs/database.md §9) ----
ALTER TABLE "Document" ADD CONSTRAINT "document_valid" CHECK (
  "size" > 0 AND "size" <= 10485760 AND
  "mimeType" IN ('application/pdf', 'image/jpeg', 'image/png') AND
  "sha256" ~ '^[0-9a-f]{64}$' AND
  length("name") BETWEEN 1 AND 120
);
-- A receipt linked to a payment must also be linked to that payment's debt.
ALTER TABLE "Document" ADD CONSTRAINT "document_payment_needs_debt" CHECK ("debtPaymentId" IS NULL OR "debtId" IS NOT NULL);
