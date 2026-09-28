import { NextRequest, NextResponse } from "next/server";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { recallFromQa } from "@/lib/quality-gate";
import { qualityErrorResponse } from "@/lib/quality/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST: pull a report the quality gate sent to QA back into progress, within 30 minutes and before a reviewer starts (Phase D8). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    return NextResponse.json(await recallFromQa(project.id, guard.actor));
  } catch (error) {
    return qualityErrorResponse("POST /api/admin/projects/[id]/quality/recall", error);
  }
}
