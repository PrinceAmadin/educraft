-- AlterTable
ALTER TABLE "ResearchJob" ADD COLUMN     "failedSteps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastStepAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3);
