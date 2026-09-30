import { NextRequest, NextResponse } from "next/server";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { wakeRun } from "@/lib/generation/orchestrator";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { CHAPTER_REVIEW_TEXT } from "@/lib/chapter-review";
import { projectReviewState } from "@/lib/services/chapter-review";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { runQualityGate } from "@/lib/quality-gate";
import { qualityErrorResponse } from "@/lib/quality/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST: chapter review, "Rebuild from approved chapters", for the founder and the COO. Every chapter
 * must be approved with nothing outstanding (409 CHAPTERS_NOT_APPROVED with `pending`). The quality
 * gate scores the report built from the approved uploads; on a pass it is recorded as the next complete
 * document: sent to QA while the report is being worked on, or kept for release after QA (supervisor
 * corrections), with no move. A fail records the result only.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const review = await projectReviewState(project.id);
    if (!review.allSettled) {
      return NextResponse.json({ error: CHAPTER_REVIEW_TEXT.notAllApproved(review.pending), code: "CHAPTERS_NOT_APPROVED", pending: review.pending }, { status: 409 });
    }
    const result = await runQualityGate(project.id, guard.actor, { rebuild: true });
    await wakeRun(project.id);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return qualityErrorResponse("POST /api/admin/projects/[id]/report/rebuild", error);
  }
}
