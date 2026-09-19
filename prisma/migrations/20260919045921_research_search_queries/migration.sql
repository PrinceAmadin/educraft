-- AlterTable
ALTER TABLE "ResearchJob" ADD COLUMN     "queriesExhausted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "searchCursor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "searchQueries" TEXT[] DEFAULT ARRAY[]::TEXT[];
