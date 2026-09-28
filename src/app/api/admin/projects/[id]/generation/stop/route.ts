import { NextRequest, NextResponse } from "next/server";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { stopGeneration } from "@/lib/generation/orchestrator";
import { orchestratorErrorResponse } from "@/lib/generation/orchestrator-routes";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST: Stop. Founder and COO only. Nothing new starts; the chapter being
 * written finishes, so nothing already paid for is lost. Start carries on
 * from the next chapter.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const run = await stopGeneration(project.id, { userId: guard.actor.userId, name: guard.actor.name });
    return NextResponse.json({ ok: true, run }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return orchestratorErrorResponse("POST /api/admin/projects/[id]/generation/stop", error);
  }
}
