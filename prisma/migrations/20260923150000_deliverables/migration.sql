-- CreateEnum
CREATE TYPE "FileStorage" AS ENUM ('EXTERNAL_LINK', 'PUBLIC_BLOB', 'PRIVATE_BLOB');

-- CreateEnum
CREATE TYPE "DeliverableKind" AS ENUM ('CHAPTER', 'FINAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('NOT_STARTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "DeliverableAccess" AS ENUM ('DOWNPAYMENT', 'BALANCE', 'ALWAYS', 'WITHHELD');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('SUBMITTED', 'RELEASED', 'RETURNED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "ProjectFile" ADD COLUMN     "blobPathname" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deliverableId" TEXT,
ADD COLUMN     "hiddenFromWorkerAt" TIMESTAMP(3),
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "storage" "FileStorage" NOT NULL DEFAULT 'EXTERNAL_LINK',
ADD COLUMN     "uploaderRole" TEXT;

-- AlterTable
ALTER TABLE "ResearchJob" ADD COLUMN     "releasedToClientAt" TIMESTAMP(3),
ADD COLUMN     "releasedToClientById" TEXT;

-- CreateTable
CREATE TABLE "ProjectDeliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "DeliverableKind" NOT NULL,
    "chapter" INTEGER,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "access" "DeliverableAccess" NOT NULL,
    "accessSetById" TEXT,
    "accessSetAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableVersion" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "releaseNo" INTEGER,
    "fileId" TEXT NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT NOT NULL,
    "submittedByRole" TEXT NOT NULL,
    "workerNote" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverableVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDeliverable_projectId_sortOrder_idx" ON "ProjectDeliverable"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDeliverable_projectId_key_key" ON "ProjectDeliverable"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableVersion_fileId_key" ON "DeliverableVersion"("fileId");

-- CreateIndex
CREATE INDEX "DeliverableVersion_status_createdAt_idx" ON "DeliverableVersion"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableVersion_deliverableId_version_key" ON "DeliverableVersion"("deliverableId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableVersion_deliverableId_releaseNo_key" ON "DeliverableVersion"("deliverableId", "releaseNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFile_blobPathname_key" ON "ProjectFile"("blobPathname");

-- CreateIndex
CREATE INDEX "ProjectFile_deliverableId_idx" ON "ProjectFile"("deliverableId");

-- CreateIndex
CREATE INDEX "ProjectFile_messageId_idx" ON "ProjectFile"("messageId");

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ProjectDeliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ProjectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableVersion" ADD CONSTRAINT "DeliverableVersion_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ProjectDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableVersion" ADD CONSTRAINT "DeliverableVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing intake uploads live in the public store.
UPDATE "ProjectFile" SET "storage" = 'PUBLIC_BLOB'
WHERE "fileUrl" LIKE 'https://%.public.blob.vercel-storage.com/%';
