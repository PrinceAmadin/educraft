import { NextRequest, NextResponse } from "next/server";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { getQualityReport } from "@/lib/quality-gate";
import { qualityErrorResponse } from "@/lib/quality/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: the latest quality check on a report (Phase D8), for the founder and the COO. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    return NextResponse.json(await getQualityReport(project.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return qualityErrorResponse("GET /api/admin/projects/[id]/quality", error);
  }
}
