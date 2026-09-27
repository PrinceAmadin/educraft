import { NextRequest } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { generationEventStream } from "@/lib/generation/generation-stream";
import { projectNotFound } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";
// The stream closes itself after 4 minutes; EventSource reconnects.
export const maxDuration = 300;

/**
 * GET (text/event-stream), Phase D6: the worker's report dashboard, live.
 * chapter_progress, chapter_complete, chapter_failed, pipeline_paused,
 * pipeline_resumed, queue_position and generation_idle for the worker's own
 * project, read from the database every 2 s (no connection held per client).
 * A run that has stalled is restarted, as on /events.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    return generationEventStream({ projectId: project.id, signal: req.signal, resumeStalled: true, pauses: true, queue: true, audience: "worker" });
  } catch (error) {
    return serverError("GET /api/worker/projects/[id]/generation/progress", error);
  }
}
