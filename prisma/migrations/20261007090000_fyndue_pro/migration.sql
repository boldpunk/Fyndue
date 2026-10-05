-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PRO_EXPIRY';

-- CreateEnum
CREATE TYPE "ProPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "proUntil" TIMESTAMPTZ(3),
ADD COLUMN     "trialEndsAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "ProPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "amount" DECIMAL(20,2),
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "status" "ProPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProPayment_userId_createdAt_idx" ON "ProPayment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProPayment_status_createdAt_idx" ON "ProPayment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ProPayment" ADD CONSTRAINT "ProPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "ProPayment" ADD CONSTRAINT "pro_payment_valid" CHECK ("days" > 0 AND "days" <= 3660 AND ("amount" IS NULL OR "amount" >= 0) AND "period" IN ('MONTH', 'YEAR', 'DAYS'));

-- Everyone who signed up before Pro existed gets the same 14-day trial as new users.
UPDATE "User" SET "trialEndsAt" = now() + interval '14 days';
