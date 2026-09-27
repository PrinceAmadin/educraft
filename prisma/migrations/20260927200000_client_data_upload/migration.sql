-- AlterTable
ALTER TABLE "PipelinePause" ADD COLUMN     "chapterFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "clockPausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedDays" INTEGER,
ADD COLUMN     "resumedById" TEXT,
ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "workerNote" TEXT;

