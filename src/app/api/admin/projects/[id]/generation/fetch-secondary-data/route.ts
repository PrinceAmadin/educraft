import { NextResponse } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound, secondaryDataErrorBody } from "@/lib/generation/route-helpers";
import { runSecondaryDataFetch, secondaryDataResponse, secondaryDataStatus, SecondaryDataError } from "@/lib/services/secondary-data";

export const dynamic = "force-dynamic";
// Each outbound request stops at 8 s; a variable that falls back to its second source can take two of them.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/** GET: whether this project takes secondary data, and the latest dataset (founder and COO). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    return NextResponse.json(await secondaryDataStatus(project.id, project.projectId), { headers: NO_STORE });
  } catch (error) {
    return serverError("GET /api/admin/projects/[id]/generation/fetch-secondary-data", error);
  }
}

/** POST: the same fetch the assigned worker can run, for the founder and the COO. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const result = await runSecondaryDataFetch(project.id, { userId: guard.session.userId, role: "ADMIN" });
    return NextResponse.json(secondaryDataResponse(result.projectCode, result), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof SecondaryDataError) return NextResponse.json(secondaryDataErrorBody(error), { status: error.status, headers: NO_STORE });
    return serverError("POST /api/admin/projects/[id]/generation/fetch-secondary-data", error);
  }
}
