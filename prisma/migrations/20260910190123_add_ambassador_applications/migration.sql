-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "AmbassadorApplication" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "universityId" TEXT,
    "otherUniversity" TEXT,
    "department" TEXT,
    "level" TEXT,
    "motivation" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "ambassadorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbassadorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorApplication_ambassadorId_key" ON "AmbassadorApplication"("ambassadorId");

-- CreateIndex
CREATE INDEX "AmbassadorApplication_status_idx" ON "AmbassadorApplication"("status");

-- AddForeignKey
ALTER TABLE "AmbassadorApplication" ADD CONSTRAINT "AmbassadorApplication_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;
