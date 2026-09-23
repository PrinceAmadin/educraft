-- CreateEnum
CREATE TYPE "ProjectUpdateKind" AS ENUM ('PAYMENT', 'STATUS', 'RESEARCH', 'RELEASE', 'REQUEST', 'CORRECTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "MessageSide" AS ENUM ('CLIENT', 'ADMIN');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "expectedDeliveryAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectUpdate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProjectUpdateKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dedupeKey" TEXT,
    "createdById" TEXT,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorSide" "MessageSide" NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "projectId" TEXT,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectUpdate_dedupeKey_key" ON "ProjectUpdate"("dedupeKey");

-- CreateIndex
CREATE INDEX "ProjectUpdate_projectId_createdAt_idx" ON "ProjectUpdate"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMessage_projectId_createdAt_idx" ON "ProjectMessage"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMessage_authorSide_readAt_idx" ON "ProjectMessage"("authorSide", "readAt");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_projectId_kind_createdAt_idx" ON "EmailLog"("projectId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: the date clients are shown starts as their own deadline, moved on
-- by any days already paused waiting for them, or the service estimate
-- (internalDeadline) when they gave no deadline.
UPDATE "Project"
SET "expectedDeliveryAt" = COALESCE("clientDeadline" + make_interval(days => "deadlinePausedDays"), "internalDeadline")
WHERE "expectedDeliveryAt" IS NULL;
