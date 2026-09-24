import { NextRequest, NextResponse } from "next/server";
import { assignReviewer } from "@/lib/services/operations/qa-reviews";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { qaAssignBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/** POST { reviewerId | "self" } — hand the review to a QA-reviewer worker, or take it yourself. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, qaAssignBodySchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await assignReviewer(params.id, guard.actor, body.data.reviewerId));
  } catch (error) {
    return opsError("POST /api/admin/qa/[id]/assign", error);
  }
}
