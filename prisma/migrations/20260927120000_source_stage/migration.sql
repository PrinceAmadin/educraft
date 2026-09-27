-- CreateEnum
CREATE TYPE "SourceStageStatus" AS ENUM ('PENDING', 'DRAFTING_OBJECTIVES', 'PLANNING_POINTS', 'SEARCHING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('CASE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "SourceOrigin" AS ENUM ('WEB', 'SUPREME_COURT', 'HANSARD', 'NATIONAL_ARCHIVES', 'INTERNET_ARCHIVE', 'WELLCOME', 'UNILAG', 'ABU', 'NATIONAL_LIBRARY', 'IBADAN', 'COO');

-- CreateTable
CREATE TABLE "ProjectBrief" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "SourceStageStatus" NOT NULL DEFAULT 'PENDING',
    "sourceKind" "SourceKind",
    "department" TEXT,
    "draftedObjectives" TEXT[],
    "objectives" TEXT[],
    "objectivesFromClient" BOOLEAN NOT NULL DEFAULT false,
    "points" JSONB,
    "searchesUsed" INTEGER NOT NULL DEFAULT 0,
    "officialLookups" INTEGER NOT NULL DEFAULT 0,
    "searchLog" JSONB,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "redraftOnly" BOOLEAN NOT NULL DEFAULT false,
    "lockedUntil" TIMESTAMP(3),
    "failedSteps" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedById" TEXT,
    "draftedAt" TIMESTAMP(3),
    "searchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "origin" "SourceOrigin" NOT NULL,
    "pointIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "court" TEXT,
    "decidedOn" TEXT,
    "citation" TEXT,
    "suitNumber" TEXT,
    "holder" TEXT,
    "reference" TEXT,
    "recordType" TEXT,
    "sourceUrl" TEXT,
    "officialUrl" TEXT,
    "relevance" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "pdfPath" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBrief_projectId_key" ON "ProjectBrief"("projectId");

-- CreateIndex
CREATE INDEX "ProjectBrief_status_idx" ON "ProjectBrief"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSource_pdfPath_key" ON "ProjectSource"("pdfPath");

-- CreateIndex
CREATE INDEX "ProjectSource_projectId_idx" ON "ProjectSource"("projectId");

-- CreateIndex
CREATE INDEX "ProjectSource_briefId_idx" ON "ProjectSource"("briefId");

-- AddForeignKey
ALTER TABLE "ProjectBrief" ADD CONSTRAINT "ProjectBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSource" ADD CONSTRAINT "ProjectSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSource" ADD CONSTRAINT "ProjectSource_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "ProjectBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

