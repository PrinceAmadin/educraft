import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { recallFromQa } from "@/lib/quality-gate";
import { qualityErrorResponse, workerActor } from "@/lib/quality/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST: the specialist recalls their auto-submitted report from the QA queue (30 minutes, before a reviewer starts). 409 `RECALL_WINDOW_CLOSED` after. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    return NextResponse.json(await recallFromQa(project.id, await workerActor(guard.workerId, guard.userId)));
  } catch (error) {
    return qualityErrorResponse("POST /api/worker/projects/[id]/quality/recall", error);
  }
}
