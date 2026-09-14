-- AlterTable
ALTER TABLE "Ambassador" ADD COLUMN     "legacySlotId" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ambassadorAllocatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Ambassador_legacySlotId_key" ON "Ambassador"("legacySlotId");

-- CreateIndex
CREATE INDEX "Expense_projectId_idx" ON "Expense"("projectId");
