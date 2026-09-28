-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receiptBlobPath" TEXT,
ADD COLUMN     "receiptStoredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PreliminaryPages" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "acknowledgement" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,
    "abstractWordCount" INTEGER NOT NULL,
    "abstractRetries" INTEGER NOT NULL DEFAULT 0,
    "abbreviations" JSONB NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "promptHash" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreliminaryPages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreliminaryPages_projectId_key" ON "PreliminaryPages"("projectId");

-- CreateIndex
CREATE INDEX "PreliminaryPages_needsReview_idx" ON "PreliminaryPages"("needsReview");

-- AddForeignKey
ALTER TABLE "PreliminaryPages" ADD CONSTRAINT "PreliminaryPages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

