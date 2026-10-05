-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "phoneNumberVerified" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "TelegramPhone" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TelegramPhone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPhone_phoneNumber_key" ON "TelegramPhone"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPhone_chatId_key" ON "TelegramPhone"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

