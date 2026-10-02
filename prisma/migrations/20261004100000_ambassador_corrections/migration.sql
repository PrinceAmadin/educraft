-- AlterTable
ALTER TABLE "Ambassador" ADD COLUMN     "provisionalReviewNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AmbassadorGroupInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "deviceHash" TEXT,
    "boundAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorGroupInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorGroupInvite_token_key" ON "AmbassadorGroupInvite"("token");

-- CreateIndex
CREATE INDEX "AmbassadorGroupInvite_ambassadorId_idx" ON "AmbassadorGroupInvite"("ambassadorId");

-- CreateIndex
CREATE INDEX "AmbassadorGroupInvite_status_idx" ON "AmbassadorGroupInvite"("status");

-- AddForeignKey
ALTER TABLE "AmbassadorGroupInvite" ADD CONSTRAINT "AmbassadorGroupInvite_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
