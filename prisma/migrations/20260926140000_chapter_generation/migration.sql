-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'OUTLINING', 'WRITING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "AiUsageLog" ADD COLUMN     "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "webSearchRequests" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GenerationCheckpoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "promptText" TEXT NOT NULL,
    "briefText" TEXT NOT NULL,
    "promptMeta" JSONB NOT NULL,
    "options" JSONB,
    "plan" JSONB,
    "partCursor" INTEGER NOT NULL DEFAULT 0,
    "partCount" INTEGER NOT NULL DEFAULT 0,
    "partialOutput" TEXT,
    "draftText" TEXT,
    "fullOutput" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requestedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "lastStepAt" TIMESTAMP(3),
    "failedSteps" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationCheckpoint_status_idx" ON "GenerationCheckpoint"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationCheckpoint_projectId_chapterNumber_key" ON "GenerationCheckpoint"("projectId", "chapterNumber");

-- AddForeignKey
ALTER TABLE "GenerationCheckpoint" ADD CONSTRAINT "GenerationCheckpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

