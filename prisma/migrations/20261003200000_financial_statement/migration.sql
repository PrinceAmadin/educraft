-- CreateTable
CREATE TABLE "FinancialStatement" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "data" JSONB NOT NULL,
    "autoEmailedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_isoWeek_key" ON "FinancialStatement"("isoWeek");

-- CreateIndex
CREATE INDEX "FinancialStatement_weekStart_idx" ON "FinancialStatement"("weekStart");

