-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isProBono" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proBonoInviteId" TEXT,
ADD COLUMN     "proBonoReason" TEXT;

-- CreateTable
CREATE TABLE "ProBonoInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "deviceHash" TEXT,
    "boundAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProBonoInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProBonoInvite_token_key" ON "ProBonoInvite"("token");

-- CreateIndex
CREATE INDEX "ProBonoInvite_status_idx" ON "ProBonoInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_proBonoInviteId_key" ON "Project"("proBonoInviteId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_proBonoInviteId_fkey" FOREIGN KEY ("proBonoInviteId") REFERENCES "ProBonoInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

