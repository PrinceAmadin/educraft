import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { ResearchError, getResearchOverview } from "@/lib/services/research";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    // Starts nothing: the objectives that follow research are started by the founder or the COO on the Report tab.
    const { job, rerun } = await getResearchOverview(guard.workerId, params.id);
    return NextResponse.json({ job, rerun });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("GET /api/worker/projects/[id]/research", error);
  }
}
