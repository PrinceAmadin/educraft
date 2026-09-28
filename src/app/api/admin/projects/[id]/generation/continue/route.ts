import { NextRequest, NextResponse } from "next/server";
import { badRequest } from "@/lib/api";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { continueGeneration, nudge } from "@/lib/generation/orchestrator";
import { continueBodySchema, optionalJson, orchestratorErrorResponse } from "@/lib/generation/orchestrator-routes";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// "Write Chapter One again" assembles its prompt before the chapter is replaced.
export const maxDuration = 60;

/**
 * POST { choice? }: Continue, after the report needed a person. Founder and
 * COO only.
 *  - continue (default): the report goes back to the queue and the facts are read afresh
 *  - accept_no_statements: carry on although Chapter One's research questions could not be read
 *  - rewrite_chapter_one: write Chapter One again (it replaces the one there)
 *  - confirm_no_references: carry on with no verified references
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const parsed = continueBodySchema.safeParse(await optionalJson(req));
  if (!parsed.success) return badRequest("choice is not one of the choices");
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const run = await continueGeneration(project.id, { userId: guard.actor.userId, name: guard.actor.name }, parsed.data.choice);
    await nudge(project.id);
    return NextResponse.json({ ok: true, run }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return orchestratorErrorResponse("POST /api/admin/projects/[id]/generation/continue", error);
  }
}
