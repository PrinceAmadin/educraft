-- DropForeignKey
ALTER TABLE "PayoutRecord" DROP CONSTRAINT "PayoutRecord_projectId_fkey";

-- AlterTable
ALTER TABLE "Ambassador" ADD COLUMN     "growthAssociateId" TEXT,
ADD COLUMN     "lastConversionAt" TIMESTAMP(3),
ADD COLUMN     "lastReferralAt" TIMESTAMP(3),
ADD COLUMN     "lifetimeConversions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lifetimeEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lifetimeReferrals" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "recruitedBy" TEXT,
ADD COLUMN     "recruitedByType" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedBy" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "referralId" TEXT;

-- AlterTable
ALTER TABLE "PayoutRecord" ADD COLUMN     "bonusKey" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AmbassadorReferral" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientWhatsapp" TEXT,
    "school" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'HOG',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    "projectValue" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbassadorReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbassadorQuarterlyChallenge" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "extensionGranted" BOOLEAN NOT NULL DEFAULT false,
    "extensionEndDate" TIMESTAMP(3),
    "extensionBy" TEXT,
    "targetCount" INTEGER NOT NULL DEFAULT 10,
    "actualCount" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "bonusPaid" BOOLEAN NOT NULL DEFAULT false,
    "bonusAmount" DOUBLE PRECISION NOT NULL DEFAULT 35000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbassadorQuarterlyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbassadorTierLog" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "fromTier" TEXT NOT NULL,
    "toTier" TEXT NOT NULL,
    "conversions" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorTierLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partnership" (
    "id" TEXT NOT NULL,
    "organisationName" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "faculty" TEXT,
    "contactPerson" TEXT,
    "contactWhatsapp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "commitmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "whatWeReceive" TEXT,
    "startDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbassadorContentLog" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "week" TEXT NOT NULL,
    "note" TEXT,
    "loggedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorContentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthAssociate" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "recruitedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "clusterName" TEXT,
    "lifetimeEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthAssociate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorReferral_projectId_key" ON "AmbassadorReferral"("projectId");

-- CreateIndex
CREATE INDEX "AmbassadorReferral_ambassadorId_status_idx" ON "AmbassadorReferral"("ambassadorId", "status");

-- CreateIndex
CREATE INDEX "AmbassadorReferral_convertedAt_idx" ON "AmbassadorReferral"("convertedAt");

-- CreateIndex
CREATE INDEX "AmbassadorReferral_submittedAt_idx" ON "AmbassadorReferral"("submittedAt");

-- CreateIndex
CREATE INDEX "AmbassadorQuarterlyChallenge_quarter_idx" ON "AmbassadorQuarterlyChallenge"("quarter");

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorQuarterlyChallenge_ambassadorId_quarter_key" ON "AmbassadorQuarterlyChallenge"("ambassadorId", "quarter");

-- CreateIndex
CREATE INDEX "AmbassadorTierLog_ambassadorId_createdAt_idx" ON "AmbassadorTierLog"("ambassadorId", "createdAt");

-- CreateIndex
CREATE INDEX "AmbassadorTierLog_createdAt_idx" ON "AmbassadorTierLog"("createdAt");

-- CreateIndex
CREATE INDEX "Partnership_status_idx" ON "Partnership"("status");

-- CreateIndex
CREATE INDEX "Partnership_renewalDate_idx" ON "Partnership"("renewalDate");

-- CreateIndex
CREATE INDEX "AmbassadorContentLog_week_idx" ON "AmbassadorContentLog"("week");

-- CreateIndex
CREATE INDEX "AmbassadorContentLog_postedAt_idx" ON "AmbassadorContentLog"("postedAt");

-- CreateIndex
CREATE INDEX "Ambassador_growthAssociateId_idx" ON "Ambassador"("growthAssociateId");

-- CreateIndex
CREATE INDEX "Ambassador_lastConversionAt_idx" ON "Ambassador"("lastConversionAt");

-- CreateIndex
CREATE INDEX "Payment_referralId_idx" ON "Payment"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRecord_bonusKey_key" ON "PayoutRecord"("bonusKey");

-- AddForeignKey
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_growthAssociateId_fkey" FOREIGN KEY ("growthAssociateId") REFERENCES "GrowthAssociate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "AmbassadorReferral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorReferral" ADD CONSTRAINT "AmbassadorReferral_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorReferral" ADD CONSTRAINT "AmbassadorReferral_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorReferral" ADD CONSTRAINT "AmbassadorReferral_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorQuarterlyChallenge" ADD CONSTRAINT "AmbassadorQuarterlyChallenge_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorTierLog" ADD CONSTRAINT "AmbassadorTierLog_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

