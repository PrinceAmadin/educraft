import { NextRequest } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { generationEventStream } from "@/lib/generation/generation-stream";
import { projectNotFound } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";
// The stream closes itself after 4 minutes; EventSource reconnects.
export const maxDuration = 300;

/**
 * GET (text/event-stream), Phase D6: the report dashboard on the Report tab,
 * for the founder and the COO. The same events as the worker's stream, with
 * the Claude cost of each finished chapter.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    return generationEventStream({ projectId: project.id, signal: req.signal, resumeStalled: true, pauses: true, queue: true, audience: "admin" });
  } catch (error) {
    return serverError("GET /api/admin/projects/[id]/generation/progress", error);
  }
}
