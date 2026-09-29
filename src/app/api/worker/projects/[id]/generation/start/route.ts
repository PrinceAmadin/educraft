import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker } from "@/lib/api";
import { db } from "@/lib/db";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { nudge, requestGeneration } from "@/lib/generation/orchestrator";
import { optionalJson, orchestratorErrorResponse, startBodySchema } from "@/lib/generation/orchestrator-routes";
import { projectNotFound } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Start assembles Chapter One's prompt once as a rehearsal before anything is spent.
export const maxDuration = 60;

/**
 * POST { confirmNoReferences? }: the assigned worker starts their own report.
 * Same orchestrator entry point as the admin route; the 409 refusals
 * (NOT_READY, ALREADY_STARTED, NEEDS_CONFIRMATION) come from
 * `requestGeneration` and apply the same way. `resolveGenerationProject`
 * takes the workerId so a project not assigned to this worker is a 404.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  const parsed = startBodySchema.safeParse(await optionalJson(req));
  if (!parsed.success) return badRequest("confirmNoReferences must be true or false");
  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    const worker = await db.worker.findUnique({ where: { id: guard.workerId }, select: { fullName: true } });
    const actor = { userId: guard.userId, name: worker?.fullName ?? "Specialist" };
    const run = await requestGeneration(project.id, actor, parsed.data);
    await nudge(project.id);
    return NextResponse.json({ ok: true, run }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return orchestratorErrorResponse("POST /api/worker/projects/[id]/generation/start", error);
  }
}
