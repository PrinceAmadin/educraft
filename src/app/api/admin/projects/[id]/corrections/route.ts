import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { findProject } from "@/lib/services/operations/project-ops";
import { listCorrectionRounds } from "@/lib/services/operations/supervisor-corrections";
import { opsError } from "@/lib/services/operations/route-helpers";
import { MAX_CORRECTION_ROUNDS } from "@/lib/operations/corrections";

export const dynamic = "force-dynamic";

/** GET — the project's supervisor correction rounds. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const project = await findProject(params.id);
    const rounds = await listCorrectionRounds(project.id);
    return NextResponse.json({ rounds, limit: MAX_CORRECTION_ROUNDS }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/projects/[id]/corrections", error);
  }
}
