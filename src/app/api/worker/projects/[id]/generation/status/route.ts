import { NextRequest, NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { getGenerationStatus, resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { resumeStalledRuns } from "@/lib/generation/generation-runner";
import { badChapter, chapterParam, projectNotFound } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET: the chapter runs of the worker's own project: status, progress, part,
 * tokens, cost and the plan. `?chapter=N` narrows to one chapter;
 * `&include=output` adds the text (written parts, the part streaming now, the
 * finished chapter). The prompt is never returned.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const chapter = chapterParam(url);
  if (chapter === null) return badChapter();

  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    const chapters = await getGenerationStatus(project.id, { chapter, withOutput: url.searchParams.get("include") === "output" });
    // Looking at a run is also what restarts one that stalled (there is no scheduled watchdog).
    const restarted = await resumeStalledRuns(chapters);
    return NextResponse.json({ projectId: project.projectId, chapters, restarted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/worker/projects/[id]/generation/status", error);
  }
}
