import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { ResearchError, resetResearchJob } from "@/lib/services/research";

// Cleanup deletes Drive files (and any legacy Zotero items) from the previous run.
export const maxDuration = 60;

/** Discards this assignment's research job (and what it created in Drive) so it can be run again. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    await resetResearchJob(guard.workerId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("POST /api/worker/projects/[id]/research/reset", error);
  }
}
