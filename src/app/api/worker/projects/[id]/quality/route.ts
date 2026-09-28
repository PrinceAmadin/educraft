import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { getQualityReport } from "@/lib/quality-gate";
import { qualityErrorResponse } from "@/lib/quality/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: the latest quality check on the assigned worker's report (Phase D8). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    return NextResponse.json(await getQualityReport(project.id, { includeCost: false }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return qualityErrorResponse("GET /api/worker/projects/[id]/quality", error);
  }
}
