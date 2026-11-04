-- AlterTable
ALTER TABLE "WorkerApplication" ADD COLUMN     "screeningStage" TEXT;

-- CreateTable
CREATE TABLE "ScreeningItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "answerKey" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningAssignment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "eyeItemIds" TEXT[],
    "relItemId" TEXT,
    "answers" JSONB,
    "eyeCorrect" INTEGER,
    "eyeTotal" INTEGER,
    "relCorrect" INTEGER,
    "relTotal" INTEGER,
    "overallPercent" INTEGER,
    "outcome" TEXT,
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

    CONSTRAINT "ScreeningAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScreeningItem_kind_isActive_idx" ON "ScreeningItem"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningAssignment_applicationId_key" ON "ScreeningAssignment"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningAssignment_token_key" ON "ScreeningAssignment"("token");

-- CreateIndex
CREATE INDEX "ScreeningAssignment_status_idx" ON "ScreeningAssignment"("status");

-- AddForeignKey
ALTER TABLE "ScreeningAssignment" ADD CONSTRAINT "ScreeningAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "WorkerApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

