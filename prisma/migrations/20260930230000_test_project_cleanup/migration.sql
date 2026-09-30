-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "testFlagNote" TEXT,
ADD COLUMN     "testFlaggedAt" TIMESTAMP(3),
ADD COLUMN     "testFlaggedById" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canFlagTestProjects" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flagAppointedAt" TIMESTAMP(3),
ADD COLUMN     "flagAppointedById" TEXT;

-- CreateTable
CREATE TABLE "DeletedProject" (
    "id" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "projectDbId" TEXT NOT NULL,
    "title" TEXT,
    "serviceCode" TEXT,
    "status" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isProBono" BOOLEAN NOT NULL DEFAULT false,
    "clientCode" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "clientDeleted" BOOLEAN NOT NULL DEFAULT false,
    "loginDeleted" BOOLEAN NOT NULL DEFAULT false,
    "projectCreatedAt" TIMESTAMP(3) NOT NULL,
    "flaggedById" TEXT,
    "flaggedByName" TEXT,
    "flagNote" TEXT,
    "reason" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "deletedById" TEXT NOT NULL,
    "deletedByName" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeletedProject_projectCode_key" ON "DeletedProject"("projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "DeletedProject_projectDbId_key" ON "DeletedProject"("projectDbId");

-- CreateIndex
CREATE INDEX "DeletedProject_deletedAt_idx" ON "DeletedProject"("deletedAt");

