-- Chapter review: the COO approves the specialist's reviewed chapters before they can be
-- downloaded, and the complete report is built only from the approved uploads.
-- Additive only. The new enum values are used by code and by `npm run chapters:backfill`,
-- never in this migration (Postgres cannot use a value in the transaction that adds it).

-- AlterEnum
ALTER TYPE "DeliverableAccess" ADD VALUE 'WITH_COMPLETE';

-- AlterEnum
ALTER TYPE "OrchestratorStatus" ADD VALUE 'WAITING_FOR_APPROVAL';

-- AlterTable
ALTER TABLE "ProjectDeliverable" ADD COLUMN     "changeNote" TEXT,
ADD COLUMN     "changeNoteAt" TIMESTAMP(3),
ADD COLUMN     "changeNoteById" TEXT,
ADD COLUMN     "clientHidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DeliverableVersion" ADD COLUMN     "builtFrom" JSONB,
ADD COLUMN     "readback" JSONB,
ADD COLUMN     "readbackAt" TIMESTAMP(3),
ADD COLUMN     "readbackText" TEXT,
ADD COLUMN     "readerVersion" INTEGER,
ADD COLUMN     "sourceHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableVersion_deliverableId_sourceHash_key" ON "DeliverableVersion"("deliverableId", "sourceHash");
