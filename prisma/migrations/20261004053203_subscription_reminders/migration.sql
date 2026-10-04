-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_CHARGE';

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "recurringId" TEXT;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "subscriptionDaysBefore" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "subscriptionReminders" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "NotificationLog_recurringId_idx" ON "NotificationLog"("recurringId");

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "subscription_days_before_range" CHECK ("subscriptionDaysBefore" BETWEEN 0 AND 7);
