import { NextRequest, NextResponse } from "next/server";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { runQualityGate } from "@/lib/quality-gate";
import { qualityErrorResponse } from "@/lib/quality/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST: run the quality gate on a report (Phase D8), for the founder and the
 * COO. 89 checks; at 85 or more with no CRITICAL failure the report goes to
 * the QA queue with a 30-minute recall window. 409 `CHAPTERS_NOT_READY` until
 * every chapter is written, `QUALITY_RUN_IN_PROGRESS` while another run holds it.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const result = await runQualityGate(project.id, guard.actor);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return qualityErrorResponse("POST /api/admin/projects/[id]/quality/run", error);
  }
}
