import { NextRequest, NextResponse } from "next/server";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { getModeCard } from "@/lib/services/research-mode";
import { modeErrorResponse } from "@/lib/services/research-mode-errors";
import { removeManualSource } from "@/lib/research/source-stage-actions";

export const dynamic = "force-dynamic";

/** DELETE: D3b, removes a source the COO added by hand (found ones are unticked instead). Founder and COO only. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; sourceId: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    await removeManualSource(params.id, params.sourceId, guard.actor);
    const { card } = await getModeCard(params.id);
    return NextResponse.json(card, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return modeErrorResponse("DELETE /api/admin/projects/[id]/mode/sources/[sourceId]", error);
  }
}
