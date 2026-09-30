-- AlterTable
ALTER TABLE "PayoutRecord" ADD COLUMN     "accruedAt" TIMESTAMP(3),
ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "cashflowVersionId" TEXT,
ADD COLUMN     "ratePercent" DOUBLE PRECISION,
ADD COLUMN     "recoveredAt" TIMESTAMP(3),
ADD COLUMN     "recoveredById" TEXT,
ADD COLUMN     "recoveryAmount" DOUBLE PRECISION,
ADD COLUMN     "refundId" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "ruleKey" TEXT,
ADD COLUMN     "triggerEventKey" TEXT;

-- AlterTable
ALTER TABLE "PerformanceBonus" ADD COLUMN     "payoutRecordId" TEXT;

-- CreateIndex
CREATE INDEX "PayoutRecord_recipientType_recipientId_status_idx" ON "PayoutRecord"("recipientType", "recipientId", "status");

-- CreateIndex
CREATE INDEX "PayoutRecord_batchId_idx" ON "PayoutRecord"("batchId");

-- CreateIndex
CREATE INDEX "PayoutRecord_accruedAt_idx" ON "PayoutRecord"("accruedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceBonus_payoutRecordId_key" ON "PerformanceBonus"("payoutRecordId");

-- AddForeignKey
ALTER TABLE "PerformanceBonus" ADD CONSTRAINT "PerformanceBonus_payoutRecordId_fkey" FOREIGN KEY ("payoutRecordId") REFERENCES "PayoutRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration (Phase 3 — the commission state machine). Idempotent.

-- Every row gets an accrual date (when it became owed): the pay date if paid, else when it was created.
UPDATE "PayoutRecord" SET "accruedAt" = COALESCE("paidAt", "createdAt") WHERE "accruedAt" IS NULL;

-- "PENDING" (the pre-Phase-3 name for "owed, unpaid") becomes ACCRUED. No new code writes PENDING.
UPDATE "PayoutRecord" SET status = 'ACCRUED' WHERE status = 'PENDING';

-- Fold every performance bonus into a BONUS-leg PayoutRecord (recipientType EXECUTIVE), so bonuses ride
-- the same ledger, queue and batch as commissions. bonusKey `perf:<id>` keeps each unique and idempotent.
INSERT INTO "PayoutRecord" (
  "id", "month", "leg", "recipientType", "recipientId", "recipientName", "bonusKey",
  "amount", "basis", "status", "accruedAt", "paidAt", "paidById", "paymentId", "notes", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, pb."month", 'BONUS', 'EXECUTIVE', pb."recipientId", pb."recipientName", 'perf:' || pb."id",
  pb."amount", pb."reason",
  CASE WHEN pb."status" = 'PENDING' THEN 'ACCRUED' ELSE pb."status" END,
  COALESCE(pb."paidAt", pb."createdAt"), pb."paidAt", pb."paidById", pb."paymentId",
  'Folded from performance bonus ' || pb."id", pb."createdAt", pb."updatedAt"
FROM "PerformanceBonus" pb
WHERE pb."payoutRecordId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "PayoutRecord" pr WHERE pr."bonusKey" = 'perf:' || pb."id");

-- Link each performance bonus to the record it became.
UPDATE "PerformanceBonus" pb
SET "payoutRecordId" = pr."id"
FROM "PayoutRecord" pr
WHERE pr."bonusKey" = 'perf:' || pb."id" AND pb."payoutRecordId" IS NULL;
