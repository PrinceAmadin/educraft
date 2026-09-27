import { NextRequest, NextResponse } from "next/server";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { getModeCard } from "@/lib/services/research-mode";
import { modeErrorResponse } from "@/lib/services/research-mode-errors";
import { carryOnSourceStage, redraftObjectives, startSourceStage } from "@/lib/research/source-stage-actions";
import { briefActionSchema } from "@/lib/validations/source-stage";

export const dynamic = "force-dynamic";

/**
 * POST { action }: D3b, the brief on the mode card. Founder and COO only.
 *  - start: draft the objectives (and, for Law or History, find cases or archival
 *    sources) for a project that has none yet, or search again after the department changed
 *  - redraft_objectives: draft the objectives again (one Claude call, no searches)
 *  - carry_on: resume a search that stopped after repeated failures
 * The work runs in the background; the answer is the card as it stands now.
 * 403 MODE_LOCKED while the card is approved or once chapters exist.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, briefActionSchema);
  if (!body.ok) return body.response;
  try {
    if (body.data.action === "start") await startSourceStage(params.id, guard.actor);
    else if (body.data.action === "redraft_objectives") await redraftObjectives(params.id, guard.actor);
    else await carryOnSourceStage(params.id, guard.actor);
    const { card } = await getModeCard(params.id);
    return NextResponse.json(card, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return modeErrorResponse("POST /api/admin/projects/[id]/mode/brief", error);
  }
}
