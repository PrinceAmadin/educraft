-- AlterTable
ALTER TABLE "FounderDraw" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "PayoutBatch" (
    "id" TEXT NOT NULL,
    "cohort" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "builtBy" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "clearedById" TEXT,
    "paymentMethod" TEXT,
    "paymentMethodDetail" TEXT,
    "batchReference" TEXT,
    "notes" TEXT,
    "bankConfirmationFileId" TEXT,
    "emailsScheduledAt" TIMESTAMP(3),
    "emailsStartedAt" TIMESTAMP(3),
    "emailsSentAt" TIMESTAMP(3),
    "emailReport" JSONB,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceFile" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutBatch_status_emailsScheduledAt_idx" ON "PayoutBatch"("status", "emailsScheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_cohort_periodKey_key" ON "PayoutBatch"("cohort", "periodKey");

-- CreateIndex
CREATE INDEX "FinanceFile_purpose_targetId_idx" ON "FinanceFile"("purpose", "targetId");

-- CreateIndex
CREATE INDEX "FounderDraw_batchId_idx" ON "FounderDraw"("batchId");

-- AddForeignKey
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderDraw" ADD CONSTRAINT "FounderDraw_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

