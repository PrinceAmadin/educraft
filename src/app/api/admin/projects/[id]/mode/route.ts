import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { kickSourceStage } from "@/lib/research/source-stage-actions";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { approveMode, getModeCard } from "@/lib/services/research-mode";
import { modeErrorResponse } from "@/lib/services/research-mode-errors";
import { modeDecisionSchema } from "@/lib/validations/research-mode";

export const dynamic = "force-dynamic";

/**
 * GET: the COO's mode card for a project: the recommended (or saved, or approved)
 * mode, the three signals behind it (department default, topic keywords, the client's
 * answer), any conflicts, what still has to be chosen, and whether it is locked.
 * Founder and COO only. Server-Timing reports the database read and the total.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const started = performance.now();
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const { card, dbMs } = await getModeCard(params.id);
    // D3b: a brief waiting to start, or whose run went quiet, starts from this request (never one that stopped after failures).
    if (card.brief && (card.brief.status === "PENDING" || card.brief.running)) {
      waitUntil(kickSourceStage(params.id).catch((error) => console.error("[mode card] could not start the source stage", error)));
    }
    return NextResponse.json(card, {
      headers: {
        "Cache-Control": "no-store",
        "Server-Timing": `db;dur=${dbMs.toFixed(1)}, total;dur=${(performance.now() - started).toFixed(1)}`,
      },
    });
  } catch (error) {
    return modeErrorResponse("GET /api/admin/projects/[id]/mode", error);
  }
}

/**
 * POST { department, modeNumber, section?, referencingStyle, customStyleText?,
 * citationPlacement?, thematicTitles?, samples?, notes? }: approves the mode and locks
 * it. 400 lists every rule the decision breaks; 403 MODE_LOCKED once it is approved or
 * chapters exist.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, modeDecisionSchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await approveMode(params.id, body.data, guard.actor));
  } catch (error) {
    return modeErrorResponse("POST /api/admin/projects/[id]/mode", error);
  }
}
