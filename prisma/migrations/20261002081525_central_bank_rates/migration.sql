-- CreateTable
CREATE TABLE "CentralBankRate" (
    "id" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "rateDate" DATE NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentralBankRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CentralBankRate_currency_rateDate_idx" ON "CentralBankRate"("currency", "rateDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CentralBankRate_currency_rateDate_key" ON "CentralBankRate"("currency", "rateDate");

-- ---- Integrity constraints ----
ALTER TABLE "CentralBankRate" ADD CONSTRAINT "central_bank_rate_valid" CHECK ("rate" > 0 AND "currency" <> 'UZS');
