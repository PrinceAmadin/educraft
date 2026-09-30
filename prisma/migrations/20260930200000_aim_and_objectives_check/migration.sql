-- AlterTable
ALTER TABLE "ProjectBrief" ADD COLUMN     "aim" TEXT,
ADD COLUMN     "draftedAim" TEXT,
ADD COLUMN     "objectivesCheck" JSONB,
ADD COLUMN     "objectivesCheckLockedUntil" TIMESTAMP(3);

