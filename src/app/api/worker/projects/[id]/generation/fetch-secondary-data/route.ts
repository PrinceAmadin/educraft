import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound, secondaryDataErrorBody } from "@/lib/generation/route-helpers";
import { runSecondaryDataFetch, secondaryDataResponse, secondaryDataStatus, SecondaryDataError } from "@/lib/services/secondary-data";

export const dynamic = "force-dynamic";
// Each outbound request stops at 8 s; a variable that falls back to its second source can take two of them.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/** GET: whether this project takes secondary data, and the latest dataset (the assigned worker only). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    return NextResponse.json(await secondaryDataStatus(project.id, project.projectId), { headers: NO_STORE });
  } catch (error) {
    return serverError("GET /api/worker/projects/[id]/generation/fetch-secondary-data", error);
  }
}

/**
 * POST: fetches a Mode 5 project's dataset from the World Bank and the CBN, for
 * the model its written Chapter 3 specifies, and keeps it for Chapters 4 and 5.
 * Free to repeat until Chapter 4 starts (the model is read once per version of
 * Chapter 3; the sources cost nothing).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    const result = await runSecondaryDataFetch(project.id, { userId: guard.userId, role: "WORKER" });
    return NextResponse.json(secondaryDataResponse(result.projectCode, result), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof SecondaryDataError) return NextResponse.json(secondaryDataErrorBody(error), { status: error.status, headers: NO_STORE });
    return serverError("POST /api/worker/projects/[id]/generation/fetch-secondary-data", error);
  }
}
