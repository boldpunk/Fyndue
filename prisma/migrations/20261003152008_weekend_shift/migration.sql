-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "shiftWeekends" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DebtScheduleItem" ADD COLUMN     "accrualDate" DATE;
