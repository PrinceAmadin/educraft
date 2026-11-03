-- Phase 0 of the AI cost work (3 Nov 2026). Additive only; identical to
-- `prisma migrate diff` against the live database at the time of writing.
-- thinkingTokens: the share of outputTokens spent on extended thinking —
-- billed at the output rate and previously invisible. batch: the call went
-- through the Message Batches API (half price). The two indexes serve the
-- AI usage panels, which group by subsystem/step and by model.

-- AlterTable
ALTER TABLE "AiUsageLog" ADD COLUMN     "batch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "thinkingTokens" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "AiUsageLog_subsystem_step_idx" ON "AiUsageLog"("subsystem", "step");

-- CreateIndex
CREATE INDEX "AiUsageLog_model_idx" ON "AiUsageLog"("model");
