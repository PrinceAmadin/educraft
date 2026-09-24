import { NextResponse } from "next/server";
import { startReview } from "@/lib/services/operations/qa-reviews";
import { opsError, opsGuard } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** POST — start the review: SUBMITTED → IN_QA_REVIEW, taken by the caller if nobody was assigned. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await startReview(params.id, guard.actor));
  } catch (error) {
    return opsError("POST /api/admin/qa/[id]/start", error);
  }
}
