-- CreateEnum
CREATE TYPE "DataPauseStatus" AS ENUM ('OPEN', 'SUBMITTED', 'RESUMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DataFormStatus" AS ENUM ('GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DataPauseKind" AS ENUM ('SPECIFICATION', 'RESULTS');

-- AlterTable
ALTER TABLE "GenerationCheckpoint" ADD COLUMN     "attachments" JSONB;

-- AlterTable
ALTER TABLE "ProjectFile" ADD COLUMN     "extractedText" TEXT,
ADD COLUMN     "pauseId" TEXT,
ADD COLUMN     "pauseSlot" TEXT;

-- CreateTable
CREATE TABLE "PipelinePause" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "afterChapter" INTEGER NOT NULL,
    "kind" "DataPauseKind" NOT NULL,
    "mode" INTEGER NOT NULL,
    "status" "DataPauseStatus" NOT NULL DEFAULT 'OPEN',
    "formStatus" "DataFormStatus" NOT NULL DEFAULT 'GENERATING',
    "formTitle" TEXT,
    "formDescription" TEXT,
    "formSpec" JSONB,
    "formError" TEXT,
    "formGeneratedAt" TIMESTAMP(3),
    "answers" JSONB,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "resumedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "openedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelinePause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelinePause_status_idx" ON "PipelinePause"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PipelinePause_projectId_afterChapter_key" ON "PipelinePause"("projectId", "afterChapter");

-- CreateIndex
CREATE INDEX "ProjectFile_pauseId_idx" ON "ProjectFile"("pauseId");

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_pauseId_fkey" FOREIGN KEY ("pauseId") REFERENCES "PipelinePause"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelinePause" ADD CONSTRAINT "PipelinePause_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

