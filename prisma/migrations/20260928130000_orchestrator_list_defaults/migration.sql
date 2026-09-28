-- Phase D9 follow-up, found in the live test: the orchestrator run's lists had no
-- default, so a list left out of an insert was NULL in Postgres. No list filter
-- matches NULL, which kept a stalled chapter's alert from ever being claimed.
-- Defaults only, plus the rows already there. Nothing is removed.

-- AlterTable
ALTER TABLE "OrchestratorRun" ALTER COLUMN "researchQuestions" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "hypotheses" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "announced" SET DEFAULT ARRAY[]::TEXT[];

-- Rows created before the defaults
UPDATE "OrchestratorRun" SET "researchQuestions" = ARRAY[]::TEXT[] WHERE "researchQuestions" IS NULL;
UPDATE "OrchestratorRun" SET "hypotheses" = ARRAY[]::TEXT[] WHERE "hypotheses" IS NULL;
UPDATE "OrchestratorRun" SET "announced" = ARRAY[]::TEXT[] WHERE "announced" IS NULL;
