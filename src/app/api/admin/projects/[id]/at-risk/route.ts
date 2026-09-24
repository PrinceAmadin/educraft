import { NextRequest, NextResponse } from "next/server";
import { setAtRisk } from "@/lib/services/operations/project-ops";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { atRiskBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/** PATCH { atRisk, note? } — flag or clear the COO's at-risk mark. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, atRiskBodySchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await setAtRisk(params.id, guard.actor, body.data.atRisk, body.data.note));
  } catch (error) {
    return opsError("PATCH /api/admin/projects/[id]/at-risk", error);
  }
}
