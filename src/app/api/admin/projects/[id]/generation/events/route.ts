import { NextRequest } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { generationEventStream } from "@/lib/generation/generation-stream";
import { badChapter, chapterParam, projectNotFound } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";
// The stream closes itself after 4 minutes; EventSource reconnects.
export const maxDuration = 300;

/**
 * GET (text/event-stream): chapter_progress, chapter_complete and
 * chapter_failed for a project, for the founder and the COO. `?chapter=N`
 * watches one chapter. A run that has stalled is restarted.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;

  const chapter = chapterParam(new URL(req.url));
  if (chapter === null) return badChapter();

  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    return generationEventStream({ projectId: project.id, chapter, signal: req.signal, resumeStalled: true });
  } catch (error) {
    return serverError("GET /api/admin/projects/[id]/generation/events", error);
  }
}
