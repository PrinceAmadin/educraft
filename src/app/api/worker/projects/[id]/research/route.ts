import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { ResearchError, getResearchJob } from "@/lib/services/research";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    const job = await getResearchJob(guard.workerId, params.id);
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("GET /api/worker/projects/[id]/research", error);
  }
}
