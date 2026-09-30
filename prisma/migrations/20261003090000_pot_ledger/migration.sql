-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "creditUsd" DOUBLE PRECISION,
ADD COLUMN     "potKey" TEXT;

-- CreateTable
CREATE TABLE "PotTransaction" (
    "id" TEXT NOT NULL,
    "potKey" TEXT NOT NULL,
    "bucketType" "BucketType" NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "month" TEXT NOT NULL,
    "allocationId" TEXT,
    "expenseId" TEXT,
    "paymentId" TEXT,
    "projectId" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PotTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PotTransaction_expenseId_key" ON "PotTransaction"("expenseId");

-- CreateIndex
CREATE INDEX "PotTransaction_potKey_month_idx" ON "PotTransaction"("potKey", "month");

-- CreateIndex
CREATE INDEX "PotTransaction_projectId_idx" ON "PotTransaction"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PotTransaction_allocationId_potKey_key" ON "PotTransaction"("allocationId", "potKey");

-- CreateIndex
CREATE INDEX "Expense_potKey_date_idx" ON "Expense"("potKey", "date");

-- The pot ledger is reconstructed from history by `npm run pots:backfill -- --apply` after deploy
-- (it splits each past BucketAllocationLog through the project's own version and maps counted
-- Operations-Reserve expenses to pots), because that needs per-version potSplit which SQL cannot do.
