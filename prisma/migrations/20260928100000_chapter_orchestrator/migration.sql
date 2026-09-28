-- Phase D9: the chapter orchestrator. Additive only.
-- OrchestratorRun (one row per report project once Start is pressed), its status enum,
-- the STALLED chapter status and GenerationCheckpoint.lastProgressAt (the watchdog's clock).
-- STALLED is added here and first used by application code, never in this file.

-- CreateEnum
CREATE TYPE "OrchestratorStatus" AS ENUM ('QUEUED', 'GENERATING', 'WAITING_FOR_DATA', 'FETCHING_DATA', 'QUALITY_CHECK', 'QUALITY_FAILED', 'HELD', 'NEEDS_ATTENTION', 'COMPLETE', 'STOPPED');

-- AlterEnum
ALTER TYPE "GenerationStatus" ADD VALUE 'STALLED';

-- AlterTable
ALTER TABLE "GenerationCheckpoint" ADD COLUMN     "lastProgressAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrchestratorRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "OrchestratorStatus" NOT NULL DEFAULT 'QUEUED',
    "currentChapter" INTEGER,
    "reason" TEXT,
    "reasonDetail" TEXT,
    "resumeStatus" "OrchestratorStatus",
    "runner" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "startedByName" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "stoppedById" TEXT,
    "allowNoReferences" BOOLEAN NOT NULL DEFAULT false,
    "researchQuestions" TEXT[],
    "hypotheses" TEXT[],
    "statementsReadAt" TIMESTAMP(3),
    "statementsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "pauseDraftAttempts" INTEGER NOT NULL DEFAULT 0,
    "fetchAttempts" INTEGER NOT NULL DEFAULT 0,
    "gateAttempts" INTEGER NOT NULL DEFAULT 0,
    "gateRequestedAt" TIMESTAMP(3),
    "gateError" TEXT,
    "kickCount" INTEGER NOT NULL DEFAULT 0,
    "lastKickAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lastTickAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "announced" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrchestratorRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrchestratorRun_projectId_key" ON "OrchestratorRun"("projectId");

-- CreateIndex
CREATE INDEX "OrchestratorRun_status_idx" ON "OrchestratorRun"("status");

-- CreateIndex
CREATE INDEX "OrchestratorRun_runner_status_idx" ON "OrchestratorRun"("runner", "status");

-- AddForeignKey
ALTER TABLE "OrchestratorRun" ADD CONSTRAINT "OrchestratorRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

