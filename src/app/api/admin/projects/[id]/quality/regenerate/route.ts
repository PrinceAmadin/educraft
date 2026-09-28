import { NextRequest, NextResponse } from "next/server";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { wakeRun } from "@/lib/generation/orchestrator";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { regenerateChapterForQuality } from "@/lib/quality-gate";
import { qualityErrorResponse, regenerateBodySchema } from "@/lib/quality/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { chapter }: re-generate one chapter with the latest quality check's
 * failures for it written into its brief (Phase D8). The founder and the COO
 * only, because it spends Claude credits (the same rule as D2's retry).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, regenerateBodySchema);
  if (!body.ok) return body.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const result = await regenerateChapterForQuality(project.id, body.data.chapter, guard.actor);
    // D9: once the chapter is written again, the orchestrator runs the quality check by itself.
    await wakeRun(project.id);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return qualityErrorResponse("POST /api/admin/projects/[id]/quality/regenerate", error);
  }
}
