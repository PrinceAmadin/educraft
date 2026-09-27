import { NextRequest } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { reportDownload } from "@/lib/assembly/respond";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: a project's assembled report as one Word file, for the founder and the COO (Phase D7). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    return await reportDownload(project.id);
  } catch (error) {
    return serverError("GET /api/admin/projects/[id]/documents/docx", error);
  }
}
