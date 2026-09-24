import { NextRequest, NextResponse } from "next/server";
import { saveQaChecklists } from "@/lib/services/operations/qa-reviews";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { qaChecklistSaveSchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/**
 * PATCH { checklist?, delivery? } — auto-save of the content checklist
 * (per service) and/or the Layer 4 delivery checklist (D1–D16).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, qaChecklistSaveSchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await saveQaChecklists(params.id, body.data));
  } catch (error) {
    return opsError("PATCH /api/admin/qa/[id]/checklist", error);
  }
}
