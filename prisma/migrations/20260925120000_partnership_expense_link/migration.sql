-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "partnershipId" TEXT;

-- CreateIndex
CREATE INDEX "Expense_partnershipId_idx" ON "Expense"("partnershipId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

