-- CreateEnum
CREATE TYPE "RosterKind" AS ENUM ('GENERAL', 'CORE', 'SUB');

-- AlterTable
ALTER TABLE "AmbassadorApplication" ADD COLUMN     "slotCode" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "AmbassadorSlot" (
    "id" TEXT NOT NULL,
    "kind" "RosterKind" NOT NULL DEFAULT 'GENERAL',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "school" TEXT NOT NULL DEFAULT '',
    "vacant" BOOLEAN NOT NULL DEFAULT false,
    "percentage" DOUBLE PRECISION,
    "parentCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbassadorSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorSlot_code_key" ON "AmbassadorSlot"("code");

-- CreateIndex
CREATE INDEX "AmbassadorSlot_kind_idx" ON "AmbassadorSlot"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorApplication_userId_key" ON "AmbassadorApplication"("userId");

-- CreateIndex
CREATE INDEX "AmbassadorApplication_slotCode_idx" ON "AmbassadorApplication"("slotCode");

