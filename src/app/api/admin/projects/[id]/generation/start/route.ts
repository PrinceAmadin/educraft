import { NextRequest, NextResponse } from "next/server";
import { badRequest } from "@/lib/api";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { nudge, requestGeneration } from "@/lib/generation/orchestrator";
import { optionalJson, orchestratorErrorResponse, startBodySchema } from "@/lib/generation/orchestrator-routes";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Start assembles Chapter One's prompt once as a rehearsal before anything is spent.
export const maxDuration = 60;

/**
 * POST { confirmNoReferences? }: Start. Founder and COO only, because it
 * spends credits. The project goes into the queue and its first chapter
 * starts when one of the three slots is free. 409 with the reasons when the
 * project is not ready, `NEEDS_CONFIRMATION` when it has no verified
 * references, `ALREADY_STARTED` for a second Start.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const parsed = startBodySchema.safeParse(await optionalJson(req));
  if (!parsed.success) return badRequest("confirmNoReferences must be true or false");
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const run = await requestGeneration(project.id, { userId: guard.actor.userId, name: guard.actor.name }, parsed.data);
    await nudge(project.id);
    return NextResponse.json({ ok: true, run }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return orchestratorErrorResponse("POST /api/admin/projects/[id]/generation/start", error);
  }
}
