import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { getProjectDetail } from "@/lib/services/projects";
import { getProjectOps } from "@/lib/services/operations/project-ops";
import { opsError } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** The full project record plus the COO's view of it (notes, rounds, review, lineage, worker load). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const project = await getProjectDetail(params.id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const ops = await getProjectOps(project.id);
    return NextResponse.json({ project, ops }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/projects/[id]", error);
  }
}
