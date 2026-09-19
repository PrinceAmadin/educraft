import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { ResearchError, advanceResearchJob, getResearchJob } from "@/lib/services/research";

// Each step does a small bounded batch of external API calls (Claude,
// OpenAlex, Unpaywall, or Drive) — 60s is generous headroom on
// Vercel Hobby's ceiling for a single one of those batches.
export const maxDuration = 60;

/**
 * Advances the research job by one bounded unit of work. The worker's
 * browser calls this repeatedly (immediately looping on success) until
 * `done: true` — see PayWithPaystackButton-style client polling, but for a
 * multi-minute pipeline instead of a single external redirect.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    const job = await getResearchJob(guard.workerId, params.id);
    if (!job) return NextResponse.json({ error: "No research job started yet" }, { status: 404 });

    const result = await advanceResearchJob(job.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/worker/projects/[id]/research/step", error);
  }
}
