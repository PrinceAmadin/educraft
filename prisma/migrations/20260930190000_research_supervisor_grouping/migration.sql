-- Cached subproblem grouping for the public supervisor page:
-- { groups: [{ subproblemIndex, referenceIds }], unassigned: [] }.
-- Minted once at PASSED (or by the research:group backfill for old rows).
ALTER TABLE "ResearchJob" ADD COLUMN "supervisorGrouping" JSONB;
