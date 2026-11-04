-- AlterTable
ALTER TABLE "ScreeningAssignment" ADD COLUMN     "formatCorrect" INTEGER,
ADD COLUMN     "formatInjected" TEXT[],
ADD COLUMN     "formatRemaining" JSONB,
ADD COLUMN     "formatTotal" INTEGER;

