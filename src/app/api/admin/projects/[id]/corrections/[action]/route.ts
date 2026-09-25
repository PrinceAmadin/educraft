import { NextRequest, NextResponse } from "next/server";
import { transitionProject } from "@/lib/services/projects";
import { escalateCorrections, sendCorrectionReminder } from "@/lib/services/operations/supervisor-corrections";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { correctionEscalateBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/**
 * POST /corrections/reminder — nudge the worker on the open round.
 * POST /corrections/complete — the corrections are done: the project is re-delivered.
 * POST /corrections/escalate { note } — out of scope: the round is escalated and the founder decides.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; action: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  try {
    switch (params.action) {
      case "reminder":
        return NextResponse.json(await sendCorrectionReminder(params.id, guard.actor));
      case "complete": {
        const project = await transitionProject(params.id, "DELIVERED", { changedById: guard.session.userId, note: "Supervisor corrections completed and re-delivered" });
        return NextResponse.json({ status: project.status });
      }
      case "escalate": {
        const body = await parseBody(req, correctionEscalateBodySchema);
        if (!body.ok) return body.response;
        return NextResponse.json(await escalateCorrections(params.id, guard.actor, body.data.note));
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    }
  } catch (error) {
    return opsError(`POST /api/admin/projects/[id]/corrections/${params.action}`, error);
  }
}
