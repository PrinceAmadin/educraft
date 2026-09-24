-- CreateEnum
CREATE TYPE "BucketType" AS ENUM ('OPERATIONS_RESERVE', 'GROWTH_FUND', 'REINVESTMENT_FUND', 'FOUNDER_DISTRIBUTION');

-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'EXECUTIVE_COMMISSION';

-- AlterTable
ALTER TABLE "Ambassador" ADD COLUMN     "parentCommRateIsOverride" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "aiUsageKey" TEXT,
ADD COLUMN     "approvalStatus" TEXT NOT NULL DEFAULT 'AUTO_APPROVED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "bucketSource" "BucketType",
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "ambassadorId" TEXT,
ADD COLUMN     "isAmbassadorDriven" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'SYSTEM';

-- CreateTable
CREATE TABLE "BucketBalance" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "operationsReserve" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "growthFund" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reinvestmentFund" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "founderDistribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BucketBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BucketAllocationLog" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "projectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "retainedAmount" DOUBLE PRECISION NOT NULL,
    "retainedRate" DOUBLE PRECISION NOT NULL,
    "operationsReserve" DOUBLE PRECISION NOT NULL,
    "growthFund" DOUBLE PRECISION NOT NULL,
    "reinvestmentFund" DOUBLE PRECISION NOT NULL,
    "founderDistribution" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BucketAllocationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BucketTransaction" (
    "id" TEXT NOT NULL,
    "bucketType" "BucketType" NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "allocationId" TEXT,
    "paymentId" TEXT,
    "expenseId" TEXT,
    "founderDrawId" TEXT,
    "projectId" TEXT,
    "recordedById" TEXT,
    "month" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BucketTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRecord" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "leg" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "basis" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paidToUserId" TEXT,
    "paymentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceBonus" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL DEFAULT 'EXECUTIVE',
    "recipientId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paymentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderDraw" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "drawType" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "monthRevenue" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "distributedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FounderDraw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutSubmission" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "workerTotal" DOUBLE PRECISION NOT NULL,
    "workerCount" INTEGER NOT NULL,
    "projectCount" INTEGER NOT NULL,
    "note" TEXT,
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BucketBalance_month_key" ON "BucketBalance"("month");

-- CreateIndex
CREATE UNIQUE INDEX "BucketAllocationLog_paymentId_key" ON "BucketAllocationLog"("paymentId");

-- CreateIndex
CREATE INDEX "BucketAllocationLog_projectId_idx" ON "BucketAllocationLog"("projectId");

-- CreateIndex
CREATE INDEX "BucketAllocationLog_month_idx" ON "BucketAllocationLog"("month");

-- CreateIndex
CREATE UNIQUE INDEX "BucketTransaction_expenseId_key" ON "BucketTransaction"("expenseId");

-- CreateIndex
CREATE INDEX "BucketTransaction_bucketType_month_idx" ON "BucketTransaction"("bucketType", "month");

-- CreateIndex
CREATE INDEX "BucketTransaction_projectId_idx" ON "BucketTransaction"("projectId");

-- CreateIndex
CREATE INDEX "BucketTransaction_allocationId_idx" ON "BucketTransaction"("allocationId");

-- CreateIndex
CREATE INDEX "BucketTransaction_founderDrawId_idx" ON "BucketTransaction"("founderDrawId");

-- CreateIndex
CREATE INDEX "PayoutRecord_month_status_idx" ON "PayoutRecord"("month", "status");

-- CreateIndex
CREATE INDEX "PayoutRecord_recipientType_recipientId_idx" ON "PayoutRecord"("recipientType", "recipientId");

-- CreateIndex
CREATE INDEX "PayoutRecord_status_idx" ON "PayoutRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRecord_projectId_leg_recipientId_key" ON "PayoutRecord"("projectId", "leg", "recipientId");

-- CreateIndex
CREATE INDEX "PerformanceBonus_month_status_idx" ON "PerformanceBonus"("month", "status");

-- CreateIndex
CREATE INDEX "FounderDraw_month_drawType_idx" ON "FounderDraw"("month", "drawType");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutSubmission_month_key" ON "PayoutSubmission"("month");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_aiUsageKey_key" ON "Expense"("aiUsageKey");

-- CreateIndex
CREATE INDEX "Expense_kind_date_idx" ON "Expense"("kind", "date");

-- CreateIndex
CREATE INDEX "Expense_bucketSource_approvalStatus_idx" ON "Expense"("bucketSource", "approvalStatus");

-- CreateIndex
CREATE INDEX "Payment_source_status_idx" ON "Payment"("source", "status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketAllocationLog" ADD CONSTRAINT "BucketAllocationLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketAllocationLog" ADD CONSTRAINT "BucketAllocationLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Phase 2 backfill: where each existing Payment row came from, and what kind each Expense is.
UPDATE "Payment" SET "source" = 'PAYSTACK'
  WHERE "paymentMethod" ILIKE 'Paystack%' OR "reference" ~ '^(EC-[0-9]+-(DP|BAL)-|INTAKE-)';
UPDATE "Payment" SET "source" = 'MANUAL'
  WHERE "source" = 'SYSTEM' AND "direction" = 'INFLOW' AND "confirmedById" IS NOT NULL;
UPDATE "Expense" SET "kind" = 'COMMISSION' WHERE "projectId" IS NOT NULL;
