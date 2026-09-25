import { NextRequest, NextResponse } from "next/server";
import { transitionProject } from "@/lib/services/projects";
import { allowedTransitions, toCandidate } from "@/lib/pipeline";
import { getProjectDetail } from "@/lib/services/projects";
import { forceProjectStatus } from "@/lib/services/operations/project-ops";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { projectStatusBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/**
 * PATCH { to, note? } — change the project's status. A forward move goes
 * through the pipeline's rules like every other; anything else (a move
 * back, or a jump) is the super admin's alone and needs a note.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, projectStatusBodySchema);
  if (!body.ok) return body.response;

  try {
    const project = await getProjectDetail(params.id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const forward = allowedTransitions(toCandidate(project)).some((r) => r.to === body.data.to);
    if (forward) {
      const moved = await transitionProject(project.id, body.data.to, { note: body.data.note, changedById: guard.session.userId });
      return NextResponse.json({ status: moved.status, forced: false });
    }
    if (guard.actor.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "That move is not a step forward in the pipeline. Only the super admin can set a status directly." }, { status: 403 });
    }
    const forced = await forceProjectStatus(project.id, guard.actor, body.data.to, body.data.note ?? "");
    return NextResponse.json({ status: forced.status, forced: true });
  } catch (error) {
    return opsError("PATCH /api/admin/projects/[id]/status", error);
  }
}
