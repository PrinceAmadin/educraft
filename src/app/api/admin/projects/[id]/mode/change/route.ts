import { NextRequest, NextResponse } from "next/server";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { changeMode } from "@/lib/services/research-mode";
import { modeErrorResponse } from "@/lib/services/research-mode-errors";
import { modeDecisionSchema } from "@/lib/validations/research-mode";

export const dynamic = "force-dynamic";

/**
 * PUT (same body as approving): saves the COO's choice without approving it.
 * 403 { error: "MODE_LOCKED" } once the mode is approved (reopen it first) or once
 * chapters have been generated (never again). Founder and COO only.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, modeDecisionSchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await changeMode(params.id, body.data, guard.actor));
  } catch (error) {
    return modeErrorResponse("PUT /api/admin/projects/[id]/mode/change", error);
  }
}
