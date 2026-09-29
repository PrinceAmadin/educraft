-- ProjectBrief: track the modeNumber each objectives set was drafted under so
-- changeMode / approveMode can spot a stale draft and redraft automatically.
ALTER TABLE "ProjectBrief" ADD COLUMN "objectivesModeNumber" INTEGER;
