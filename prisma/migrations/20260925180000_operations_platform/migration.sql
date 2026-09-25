-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "atRisk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "atRiskAt" TIMESTAMP(3),
ADD COLUMN     "atRiskNote" TEXT,
ADD COLUMN     "parentProjectId" TEXT,
ADD COLUMN     "qaFirstPassDate" TIMESTAMP(3),
ADD COLUMN     "seniorReviewNote" TEXT,
ADD COLUMN     "seniorReviewRequestedAt" TIMESTAMP(3),
ADD COLUMN     "supervisorHighRisk" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "isQaReviewer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qaReviewerSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorType" TEXT NOT NULL DEFAULT 'EXEC',
    "authorId" TEXT,
    "authorName" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupervisorCorrection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "clientNote" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "escalationNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupervisorCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewerType" TEXT,
    "reviewerName" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "formattingScore" DOUBLE PRECISION,
    "structuralPass" BOOLEAN,
    "referenceVerPass" BOOLEAN,
    "voiceCheckPass" BOOLEAN,
    "tier3Triggered" BOOLEAN NOT NULL DEFAULT false,
    "tier3Results" JSONB,
    "deliveryChecklist" JSONB,
    "allChecksPassed" BOOLEAN NOT NULL DEFAULT false,
    "decision" TEXT,
    "revisionNotes" TEXT,
    "escalationReason" TEXT,
    "round" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerId" TEXT,
    "requestedById" TEXT,
    "papersRequested" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "rerunRequestId" TEXT,
    "runLogId" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deniedBy" TEXT,
    "deniedAt" TIMESTAMP(3),
    "denialReason" TEXT,
    "pipelineLog" JSONB,
    "totalReferences" INTEGER,
    "openAccessCount" INTEGER,
    "paywalledCount" INTEGER,
    "actualCostNaira" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerFlag" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REVIEW',
    "reason" TEXT NOT NULL,
    "projectId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerNote" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectNote_projectId_createdAt_idx" ON "ProjectNote"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "SupervisorCorrection_projectId_idx" ON "SupervisorCorrection"("projectId");

-- CreateIndex
CREATE INDEX "SupervisorCorrection_status_idx" ON "SupervisorCorrection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SupervisorCorrection_projectId_roundNumber_key" ON "SupervisorCorrection"("projectId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QaReview_projectId_key" ON "QaReview"("projectId");

-- CreateIndex
CREATE INDEX "QaReview_reviewerId_idx" ON "QaReview"("reviewerId");

-- CreateIndex
CREATE INDEX "QaReview_decision_idx" ON "QaReview"("decision");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchRequest_rerunRequestId_key" ON "ResearchRequest"("rerunRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchRequest_runLogId_key" ON "ResearchRequest"("runLogId");

-- CreateIndex
CREATE INDEX "ResearchRequest_projectId_idx" ON "ResearchRequest"("projectId");

-- CreateIndex
CREATE INDEX "ResearchRequest_status_idx" ON "ResearchRequest"("status");

-- CreateIndex
CREATE INDEX "ResearchRequest_createdAt_idx" ON "ResearchRequest"("createdAt");

-- CreateIndex
CREATE INDEX "WorkerFlag_workerId_createdAt_idx" ON "WorkerFlag"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerFlag_kind_idx" ON "WorkerFlag"("kind");

-- CreateIndex
CREATE INDEX "WorkerNote_workerId_createdAt_idx" ON "WorkerNote"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "Project_atRisk_idx" ON "Project"("atRisk");

-- CreateIndex
CREATE INDEX "Project_parentProjectId_idx" ON "Project"("parentProjectId");

-- CreateIndex
CREATE INDEX "Worker_isQaReviewer_idx" ON "Worker"("isQaReviewer");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupervisorCorrection" ADD CONSTRAINT "SupervisorCorrection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaReview" ADD CONSTRAINT "QaReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRequest" ADD CONSTRAINT "ResearchRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRequest" ADD CONSTRAINT "ResearchRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerFlag" ADD CONSTRAINT "WorkerFlag_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerFlag" ADD CONSTRAINT "WorkerFlag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerFlag" ADD CONSTRAINT "WorkerFlag_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerNote" ADD CONSTRAINT "WorkerNote_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerNote" ADD CONSTRAINT "WorkerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

