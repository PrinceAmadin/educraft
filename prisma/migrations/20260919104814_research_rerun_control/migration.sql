-- CreateEnum
CREATE TYPE "ResearchRunKind" AS ENUM ('INITIAL', 'RERUN');

-- CreateEnum
CREATE TYPE "RerunRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'USED');

-- CreateTable
CREATE TABLE "ResearchRunLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "kind" "ResearchRunKind" NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchRerunRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RerunRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedUntil" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRerunRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchRunLog_projectId_idx" ON "ResearchRunLog"("projectId");

-- CreateIndex
CREATE INDEX "ResearchRerunRequest_projectId_status_idx" ON "ResearchRerunRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "ResearchRerunRequest_status_idx" ON "ResearchRerunRequest"("status");

-- AddForeignKey
ALTER TABLE "ResearchRunLog" ADD CONSTRAINT "ResearchRunLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRunLog" ADD CONSTRAINT "ResearchRunLog_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRerunRequest" ADD CONSTRAINT "ResearchRerunRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRerunRequest" ADD CONSTRAINT "ResearchRerunRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRerunRequest" ADD CONSTRAINT "ResearchRerunRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
