-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cardLast4" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ingestTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_ingestTokenHash_key" ON "User"("ingestTokenHash");

