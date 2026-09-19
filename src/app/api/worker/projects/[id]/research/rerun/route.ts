import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { ResearchError, rerunResearchJob } from "@/lib/services/research";
import { ResearchApprovalRequiredError } from "@/lib/services/research-runs";
import { scheduleResearchStep } from "@/lib/services/research-runner";

// Clears the previous run's Drive files before starting again.
export const maxDuration = 60;

/**
 * Throws the current results away and starts research afresh. Rationed on the
 * server: one free re-run per project, then only with an approved request.
 * A refused call deletes nothing.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    const job = await rerunResearchJob(guard.workerId, params.id, guard.userId);
    await scheduleResearchStep(job.id);
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof ResearchApprovalRequiredError) {
      return NextResponse.json({ error: error.message, code: "APPROVAL_REQUIRED" }, { status: 403 });
    }
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/worker/projects/[id]/research/rerun", error);
  }
}
