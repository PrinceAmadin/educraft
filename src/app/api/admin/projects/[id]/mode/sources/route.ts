import { NextRequest, NextResponse } from "next/server";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { getModeCard } from "@/lib/services/research-mode";
import { modeErrorResponse } from "@/lib/services/research-mode-errors";
import { addManualSource } from "@/lib/research/source-stage-actions";
import { manualSourceSchema } from "@/lib/validations/source-stage";

export const dynamic = "force-dynamic";

/**
 * POST: D3b, adds a case (Law) or archival record (History) the COO knows of,
 * under one of the searched points. Ticked, marked "Added by the COO".
 * Founder and COO only; 403 MODE_LOCKED while the card is approved.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, manualSourceSchema);
  if (!body.ok) return body.response;
  try {
    await addManualSource(params.id, body.data, guard.actor);
    const { card } = await getModeCard(params.id);
    return NextResponse.json(card, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return modeErrorResponse("POST /api/admin/projects/[id]/mode/sources", error);
  }
}
