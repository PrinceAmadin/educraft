-- CreateEnum
CREATE TYPE "ResearchJobStatus" AS ENUM ('FINDING_CANDIDATES', 'VERIFYING_DOIS', 'RESOLVING_PDFS', 'IMPORTING_ZOTERO', 'CLASSIFYING', 'REPLACING', 'UPLOADING_DRIVE', 'PASSED', 'FAILED_NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ReferenceStatus" AS ENUM ('CANDIDATE', 'DOI_REJECTED', 'NO_OA_PDF', 'IMPORTED', 'REPLACED', 'KEPT');

-- CreateEnum
CREATE TYPE "ReferenceClassification" AS ENUM ('CORE', 'CLOSELY_RELATED', 'TANGENTIAL', 'IRRELEVANT');

-- CreateTable
CREATE TABLE "ResearchJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "ResearchJobStatus" NOT NULL DEFAULT 'FINDING_CANDIDATES',
    "targetCount" INTEGER NOT NULL DEFAULT 40,
    "replacementRound" INTEGER NOT NULL DEFAULT 0,
    "zoteroCollectionKey" TEXT,
    "driveFolderLink" TEXT,
    "corePercent" DOUBLE PRECISION,
    "closelyRelatedPercent" DOUBLE PRECISION,
    "triedTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL,
    "researchJobId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "proposedTitle" TEXT NOT NULL,
    "proposedYear" INTEGER,
    "doi" TEXT,
    "title" TEXT,
    "authors" TEXT,
    "year" INTEGER,
    "journal" TEXT,
    "abstract" TEXT,
    "pdfUrl" TEXT,
    "zoteroItemKey" TEXT,
    "driveFileId" TEXT,
    "status" "ReferenceStatus" NOT NULL DEFAULT 'CANDIDATE',
    "classification" "ReferenceClassification",
    "classificationReason" TEXT,
    "round" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchJob_projectId_key" ON "ResearchJob"("projectId");

-- CreateIndex
CREATE INDEX "ResearchJob_status_idx" ON "ResearchJob"("status");

-- CreateIndex
CREATE INDEX "Reference_researchJobId_idx" ON "Reference"("researchJobId");

-- CreateIndex
CREATE INDEX "Reference_projectId_idx" ON "Reference"("projectId");

-- CreateIndex
CREATE INDEX "Reference_doi_idx" ON "Reference"("doi");

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_researchJobId_fkey" FOREIGN KEY ("researchJobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
