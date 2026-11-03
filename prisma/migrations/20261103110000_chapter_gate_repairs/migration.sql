-- Surgical chapter repair (3 Nov 2026). Additive; identical to `prisma migrate
-- diff` against the live database. Counts repair attempts on a chapter's text
-- (applied or not, so a repair that fixes nothing cannot loop); a rewrite
-- re-creates the checkpoint row and the count starts again at 0.

-- AlterTable
ALTER TABLE "GenerationCheckpoint" ADD COLUMN     "gateRepairNo" INTEGER NOT NULL DEFAULT 0;
