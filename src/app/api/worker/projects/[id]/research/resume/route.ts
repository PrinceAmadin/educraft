import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { ResearchError, getResearchJob } from "@/lib/services/research";
import { scheduleResearchStep } from "@/lib/services/research-runner";

/**
 * Restarts the background run if it stopped (a step kept failing, or a link
 * in the chain was lost). Safe to call any time — a step takes a lease first,
 * so if the job is already running this does nothing.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    const job = await getResearchJob(guard.workerId, params.id);
    if (!job) return NextResponse.json({ error: "No research job started yet" }, { status: 404 });
    if (job.status === "PASSED" || job.status === "FAILED_NEEDS_REVIEW") {
      return NextResponse.json({ ok: true, done: true });
    }
    await scheduleResearchStep(job.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("POST /api/worker/projects/[id]/research/resume", error);
  }
}
