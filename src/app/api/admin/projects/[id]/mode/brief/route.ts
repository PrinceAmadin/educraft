import { NextRequest, NextResponse } from "next/server";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { getModeCard } from "@/lib/services/research-mode";
import { modeErrorResponse } from "@/lib/services/research-mode-errors";
import {
  addAimToLockedBrief,
  carryOnSourceStage,
  checkObjectives,
  draftAimForBrief,
  redraftObjectives,
  startSourceStage,
  suggestAimForLockedBrief,
} from "@/lib/research/source-stage-actions";
import { briefActionSchema } from "@/lib/validations/source-stage";

export const dynamic = "force-dynamic";
// draft_aim and suggest_aim wait for the Claude Opus 5.5 aim call (usually 10–30 s; 140 s cap, one retry).
export const maxDuration = 300;

/**
 * POST { action }: D3b, the brief on the mode card. Founder and COO only.
 *  - start: draft the objectives (and, for Law or History, find cases or archival
 *    sources) for a project that has none yet, or search again after the department changed
 *  - redraft_objectives: draft the objectives again (one Claude call, no searches)
 *  - carry_on: resume a search that stopped after repeated failures
 *  - draft_aim: write the aim the objectives serve (objectives kept), then check them
 *  - suggest_aim / add_aim {aim}: a report approved without an aim (locked card only):
 *    suggest one, then save the founder's or COO's version; nothing else changes
 *  - check_objectives: the independent check of what is saved (409 CHECK_RUNNING)
 * The work runs in the background; the answer is the card as it stands now.
 * 403 MODE_LOCKED while the card is approved or once chapters exist.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, briefActionSchema);
  if (!body.ok) return body.response;
  try {
    const a = body.data.action;
    if (a === "start") await startSourceStage(params.id, guard.actor);
    else if (a === "redraft_objectives") await redraftObjectives(params.id, guard.actor);
    else if (a === "carry_on") await carryOnSourceStage(params.id, guard.actor);
    else if (a === "draft_aim") await draftAimForBrief(params.id, guard.actor);
    else if (a === "suggest_aim") await suggestAimForLockedBrief(params.id, guard.actor);
    else if (a === "add_aim") await addAimToLockedBrief(params.id, body.data.aim ?? "", guard.actor);
    else await checkObjectives(params.id);
    const { card } = await getModeCard(params.id);
    return NextResponse.json(card, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return modeErrorResponse("POST /api/admin/projects/[id]/mode/brief", error);
  }
}
