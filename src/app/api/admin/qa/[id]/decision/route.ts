import { NextRequest, NextResponse } from "next/server";
import { submitQaDecisionOps } from "@/lib/services/operations/qa-reviews";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { qaDecisionSchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/**
 * POST { decision: approve | revision | minor_fixes | escalate, notes?, score?, checklist?, delivery? }
 * Approve and minor fixes need all sixteen delivery checks; revision and escalate need notes.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, qaDecisionSchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await submitQaDecisionOps(params.id, body.data, guard.actor));
  } catch (error) {
    return opsError("POST /api/admin/qa/[id]/decision", error);
  }
}
