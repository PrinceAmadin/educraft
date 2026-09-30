-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "cashflowVersionId" TEXT;

-- CreateTable
CREATE TABLE "CashflowVersion" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "structure" JSONB NOT NULL,
    "structureHash" TEXT NOT NULL,
    "diff" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashflowAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashflowVersion_versionNumber_key" ON "CashflowVersion"("versionNumber");

-- CreateIndex
CREATE INDEX "CashflowVersion_effectiveFrom_idx" ON "CashflowVersion"("effectiveFrom");

-- CreateIndex
CREATE INDEX "CashflowVersion_effectiveTo_idx" ON "CashflowVersion"("effectiveTo");

-- CreateIndex
CREATE INDEX "CashflowAuditLog_actorUserId_createdAt_idx" ON "CashflowAuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CashflowAuditLog_entityType_entityId_idx" ON "CashflowAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "CashflowAuditLog_createdAt_idx" ON "CashflowAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Project_cashflowVersionId_idx" ON "Project"("cashflowVersionId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_cashflowVersionId_fkey" FOREIGN KEY ("cashflowVersionId") REFERENCES "CashflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
