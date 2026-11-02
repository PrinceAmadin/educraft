-- The ambassador tutorial video. Additive: five nullable/defaulted columns on
-- Ambassador. Old code ignores them; new code treats a NULL tourVersion as
-- "has not watched this version", which is why `ambassadors:tour-backfill`
-- stamps every ambassador that already existed BEFORE the gate can meet them.
-- Identical to `prisma migrate diff` against the previous schema.

-- AlterTable
ALTER TABLE "Ambassador" ADD COLUMN     "tourDurationSeconds" INTEGER,
ADD COLUMN     "tourSecondsWatched" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tourStartedAt" TIMESTAMP(3),
ADD COLUMN     "tourVersion" TEXT,
ADD COLUMN     "tourWatchedAt" TIMESTAMP(3);
