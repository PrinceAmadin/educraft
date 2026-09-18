-- CreateTable
CREATE TABLE "PendingIntake" (
    "id" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultProjectCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "PendingIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingIntake_reference_key" ON "PendingIntake"("reference");

-- CreateIndex
CREATE INDEX "PendingIntake_status_idx" ON "PendingIntake"("status");
