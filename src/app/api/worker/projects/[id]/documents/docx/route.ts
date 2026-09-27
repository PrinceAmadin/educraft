import { NextRequest } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { reportDownload } from "@/lib/assembly/respond";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET: the assigned worker's report as one Word file (Phase D7): the
 * preliminary pages, every chapter and the References, formatted to the 71
 * rules. 404 for another worker's project or one that is not a report; 409
 * `CHAPTERS_NOT_READY` with the chapters still to come.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    return await reportDownload(project.id);
  } catch (error) {
    return serverError("GET /api/worker/projects/[id]/documents/docx", error);
  }
}
