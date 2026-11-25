-- CreateTable
CREATE TABLE "AmbassadorNameChange" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "oldName" TEXT NOT NULL,
    "newName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorNameChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmbassadorNameChange_ambassadorId_createdAt_idx" ON "AmbassadorNameChange"("ambassadorId", "createdAt");

-- CreateIndex
CREATE INDEX "AmbassadorNameChange_source_createdAt_idx" ON "AmbassadorNameChange"("source", "createdAt");

-- AddForeignKey
ALTER TABLE "AmbassadorNameChange" ADD CONSTRAINT "AmbassadorNameChange_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

