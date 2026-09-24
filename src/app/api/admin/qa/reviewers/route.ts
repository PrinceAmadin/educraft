import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { listQaReviewers } from "@/lib/services/operations/qa-reviews";
import { opsError } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET — workers designated as QA reviewers, with how many reviews each has open. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ reviewers: await listQaReviewers() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/qa/reviewers", error);
  }
}
