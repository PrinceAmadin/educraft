import { NextRequest, NextResponse } from "next/server";
import { clearSeniorReview, requestSeniorReview } from "@/lib/services/operations/project-ops";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { seniorReviewBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/** POST { note } — mark the project for a senior domain review (the founder is told). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, seniorReviewBodySchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await requestSeniorReview(params.id, guard.actor, body.data.note));
  } catch (error) {
    return opsError("POST /api/admin/projects/[id]/senior-review", error);
  }
}

/** DELETE — the review is done or no longer needed. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await clearSeniorReview(params.id, guard.actor));
  } catch (error) {
    return opsError("DELETE /api/admin/projects/[id]/senior-review", error);
  }
}
