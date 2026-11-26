-- CreateTable
CREATE TABLE "RecruitCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "holderType" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "batch" TEXT,
    "universityId" TEXT,
    "printedCount" INTEGER,
    "unitCostNgn" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "RecruitCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecruitCard_code_key" ON "RecruitCard"("code");

-- CreateIndex
CREATE INDEX "RecruitCard_holderType_holderId_idx" ON "RecruitCard"("holderType", "holderId");

-- CreateIndex
CREATE INDEX "RecruitCard_batch_idx" ON "RecruitCard"("batch");

-- CreateIndex
CREATE INDEX "RecruitCard_status_idx" ON "RecruitCard"("status");

-- AddForeignKey
ALTER TABLE "RecruitCard" ADD CONSTRAINT "RecruitCard_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "AmbassadorApplication" ADD COLUMN     "recruitCardCode" TEXT,
ADD COLUMN     "recruitedBy" TEXT,
ADD COLUMN     "recruitedByType" TEXT;

-- CreateIndex
CREATE INDEX "AmbassadorApplication_recruitCardCode_idx" ON "AmbassadorApplication"("recruitCardCode");
