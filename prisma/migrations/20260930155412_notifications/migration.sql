-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DUE_IN_DAYS', 'DUE_TODAY', 'OVERDUE', 'TEST');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TelegramConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyDaysBefore" INTEGER[] DEFAULT ARRAY[7, 3, 1]::INTEGER[],
    "notifyOnDueDate" BOOLEAN NOT NULL DEFAULT true,
    "notifyWhenOverdue" BOOLEAN NOT NULL DEFAULT true,
    "overdueRepeatDays" INTEGER NOT NULL DEFAULT 3,
    "quietHoursStart" TEXT DEFAULT '22:00',
    "quietHoursEnd" TEXT DEFAULT '09:00',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "telegramUsername" TEXT,
    "connectionCodeHash" TEXT,
    "connectionCodeExpiresAt" TIMESTAMPTZ(3),
    "connectedAt" TIMESTAMPTZ(3),
    "status" "TelegramConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TelegramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debtId" TEXT,
    "scheduleItemId" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "externalMessageId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConnection_userId_key" ON "TelegramConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConnection_telegramChatId_key" ON "TelegramConnection"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConnection_connectionCodeHash_key" ON "TelegramConnection"("connectionCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_deduplicationKey_key" ON "NotificationLog"("deduplicationKey");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_createdAt_idx" ON "NotificationLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_status_scheduledAt_idx" ON "NotificationLog"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "NotificationLog_scheduleItemId_idx" ON "NotificationLog"("scheduleItemId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConnection" ADD CONSTRAINT "TelegramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---- Integrity constraints (docs/telegram.md) ----
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "notification_preference_valid" CHECK (
  "overdueRepeatDays" BETWEEN 1 AND 30 AND
  ("quietHoursStart" IS NULL OR "quietHoursStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND
  ("quietHoursEnd" IS NULL OR "quietHoursEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
ALTER TABLE "NotificationLog" ADD CONSTRAINT "notification_attempts_valid" CHECK ("attempts" >= 0);
