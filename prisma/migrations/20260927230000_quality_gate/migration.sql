-- AlterTable
ALTER TABLE "QaReview" ADD COLUMN     "autoSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "failuresJson" JSONB,
ADD COLUMN     "qualityPassed" BOOLEAN,
ADD COLUMN     "qualityReport" JSONB,
ADD COLUMN     "qualityRunAt" TIMESTAMP(3),
ADD COLUMN     "qualityRunById" TEXT,
ADD COLUMN     "qualityRunLockedUntil" TIMESTAMP(3),
ADD COLUMN     "qualityScore" INTEGER,
ADD COLUMN     "qualityTotal" INTEGER,
ADD COLUMN     "recallWindowExpiresAt" TIMESTAMP(3),
ADD COLUMN     "recalledAt" TIMESTAMP(3),
ADD COLUMN     "recalledById" TEXT,
ADD COLUMN     "referenceScore" INTEGER,
ADD COLUMN     "structuralScore" INTEGER,
ADD COLUMN     "voiceScore" INTEGER;

