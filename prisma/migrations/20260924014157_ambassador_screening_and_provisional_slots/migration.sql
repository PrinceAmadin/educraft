-- AlterTable
ALTER TABLE "Ambassador" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "provisionalUntil" TIMESTAMP(3),
ADD COLUMN     "provisionalWarnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AmbassadorApplication" ADD COLUMN     "clientUpsetReply" TEXT,
ADD COLUMN     "expectedReferrals" INTEGER,
ADD COLUMN     "firstWeekPlan" TEXT,
ADD COLUMN     "objectionReply" TEXT,
ADD COLUMN     "pitchMessage" TEXT,
ADD COLUMN     "reachGroups" TEXT,
ADD COLUMN     "reachRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reachSize" TEXT,
ADD COLUMN     "serviceCheck" TEXT;

-- CreateIndex
CREATE INDEX "Ambassador_provisionalUntil_idx" ON "Ambassador"("provisionalUntil");

