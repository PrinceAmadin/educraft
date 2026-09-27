import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { waitUntil } from "@vercel/functions";
import { ResearchError, getResearchOverview } from "@/lib/services/research";
import { kickSourceStage } from "@/lib/research/source-stage-actions";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    const { job, rerun } = await getResearchOverview(guard.workerId, params.id);
    // D3b: research that has passed hands over to the objectives stage, started from this browser request.
    if (job?.status === "PASSED") {
      waitUntil(kickSourceStage(params.id).catch((error) => console.error("[research] could not start the source stage", error)));
    }
    return NextResponse.json({ job, rerun });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("GET /api/worker/projects/[id]/research", error);
  }
}
