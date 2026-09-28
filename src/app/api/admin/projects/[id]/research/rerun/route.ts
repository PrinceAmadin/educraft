import { NextRequest, NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { ResearchError, rerunResearchAsAdmin } from "@/lib/services/research";
import { ResearchLockedError } from "@/lib/services/research-runs";
import { scheduleResearchStep } from "@/lib/services/research-runner";
import { wakeRun } from "@/lib/generation/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Clears the previous run's Drive files before starting again.
export const maxDuration = 60;

/**
 * POST: the founder or the COO throws the project's research away and runs it
 * again (Phase D9). No approval request is needed (they are the approvers);
 * the run is logged and appears in the research ledger. Refused with 409
 * `GENERATION_STARTED` once any chapter exists: a re-run would delete the
 * references the chapters were written from. A refused call deletes nothing.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const job = await rerunResearchAsAdmin(params.id, guard.actor.userId);
    await scheduleResearchStep(job.id);
    // A report waiting in the queue holds until the new research has passed.
    await wakeRun(job.projectId);
    return NextResponse.json({ ok: true, jobId: job.id, status: job.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ResearchLockedError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof ResearchError) return NextResponse.json({ error: error.message }, { status: /not found/i.test(error.message) ? 404 : 409 });
    return serverError("POST /api/admin/projects/[id]/research/rerun", error);
  }
}
