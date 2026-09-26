-- CreateEnum
CREATE TYPE "IntakeModeAnswer" AS ENUM ('A', 'B', 'C', 'D', 'E');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "intakeModeAnswer" "IntakeModeAnswer";

-- CreateTable
CREATE TABLE "ResearchMode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "modeNumber" INTEGER NOT NULL,
    "modeName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "sectionOverride" TEXT,
    "referencingStyle" TEXT NOT NULL,
    "citationPlacement" TEXT,
    "thematicTitleChapter3" TEXT,
    "thematicTitleChapter4" TEXT,
    "nonHumanSamples" BOOLEAN,
    "samplesDescription" TEXT,
    "recommendedMode" INTEGER,
    "clientIntakeAnswer" TEXT,
    "departmentDefault" INTEGER,
    "keywordTriggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conflictDetected" BOOLEAN NOT NULL DEFAULT false,
    "cooApprovedBy" TEXT,
    "cooApprovedByName" TEXT,
    "cooApprovedAt" TIMESTAMP(3),
    "cooNotes" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchMode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchMode_projectId_key" ON "ResearchMode"("projectId");

-- AddForeignKey
ALTER TABLE "ResearchMode" ADD CONSTRAINT "ResearchMode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

