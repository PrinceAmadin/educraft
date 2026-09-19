-- CreateEnum
CREATE TYPE "ReferenceAccess" AS ENUM ('OPEN_ACCESS', 'PAYWALLED');

-- AlterTable
ALTER TABLE "Reference" ADD COLUMN     "access" "ReferenceAccess";

-- AlterTable
ALTER TABLE "ResearchJob" ADD COLUMN     "paywalledDocId" TEXT,
ADD COLUMN     "paywalledDocLink" TEXT;
