-- AlterTable
ALTER TABLE "Ambassador" ADD COLUMN     "parentCommRate" DOUBLE PRECISION,
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "parentAmbassadorId" TEXT,
ADD COLUMN     "parentCommPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentCommRate" DOUBLE PRECISION,
ADD COLUMN     "parentCommission" DOUBLE PRECISION,
ADD COLUMN     "parentNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Ambassador_parentId_idx" ON "Ambassador"("parentId");

-- CreateIndex
CREATE INDEX "Project_parentAmbassadorId_idx" ON "Project"("parentAmbassadorId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentAmbassadorId_fkey" FOREIGN KEY ("parentAmbassadorId") REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
