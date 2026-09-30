-- CreateEnum
CREATE TYPE "ChapterCheckSubject" AS ENUM ('AI_TEXT', 'UPLOAD');

-- CreateEnum
CREATE TYPE "ChapterCheckStatus" AS ENUM ('RUNNING', 'PASSED', 'FAILED', 'ERROR');

-- AlterTable
ALTER TABLE "DeliverableVersion" ADD COLUMN     "formattedFileId" TEXT;

-- AlterTable
ALTER TABLE "GenerationCheckpoint" ADD COLUMN     "gateRewriteNo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "outputHash" TEXT;

-- CreateTable
CREATE TABLE "ChapterCheck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "subject" "ChapterCheckSubject" NOT NULL,
    "versionId" TEXT,
    "textHash" TEXT NOT NULL,
    "status" "ChapterCheckStatus" NOT NULL DEFAULT 'RUNNING',
    "lockedUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "applicable" INTEGER,
    "passedCount" INTEGER,
    "failures" JSONB,
    "warnings" JSONB,
    "rewritable" BOOLEAN,
    "notes" JSONB,
    "ai" JSONB,
    "costNaira" DOUBLE PRECISION,
    "error" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterCheck_projectId_chapterNumber_idx" ON "ChapterCheck"("projectId", "chapterNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterCheck_projectId_chapterNumber_subject_textHash_key" ON "ChapterCheck"("projectId", "chapterNumber", "subject", "textHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableVersion_formattedFileId_key" ON "DeliverableVersion"("formattedFileId");

-- AddForeignKey
ALTER TABLE "DeliverableVersion" ADD CONSTRAINT "DeliverableVersion_formattedFileId_fkey" FOREIGN KEY ("formattedFileId") REFERENCES "ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterCheck" ADD CONSTRAINT "ChapterCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

