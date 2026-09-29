-- Store a per-job project analysis (goal, components, subproblems, off-topic guards)
-- that query generation and Tier 2 relevance both read.
ALTER TABLE "ResearchJob" ADD COLUMN "projectAnalysis" JSONB;
