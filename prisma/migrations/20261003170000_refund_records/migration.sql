-- CreateTable
CREATE TABLE "RefundRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "detectedStage" INTEGER NOT NULL,
    "refundPercent" DOUBLE PRECISION NOT NULL,
    "refundAmount" DOUBLE PRECISION NOT NULL,
    "moneyInAtRefund" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "paymentId" TEXT,
    "bankConfirmationFileId" TEXT,
    "workerPartialAmount" DOUBLE PRECISION,
    "reversedRecordIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clientEmailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefundRecord_paymentId_key" ON "RefundRecord"("paymentId");

-- CreateIndex
CREATE INDEX "RefundRecord_projectId_idx" ON "RefundRecord"("projectId");

