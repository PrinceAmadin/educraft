-- CreateTable
CREATE TABLE "FinalAssessment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "chapter1Text" TEXT,
    "chapter2Text" TEXT,
    "memoResponse" TEXT,
    "promptResponse" TEXT,
    "voiceFindings" JSONB,
    "reviewDecision" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sentById" TEXT,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinalAssessment_applicationId_key" ON "FinalAssessment"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinalAssessment_token_key" ON "FinalAssessment"("token");

-- CreateIndex
CREATE INDEX "FinalAssessment_status_idx" ON "FinalAssessment"("status");

-- AddForeignKey
ALTER TABLE "FinalAssessment" ADD CONSTRAINT "FinalAssessment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "WorkerApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

