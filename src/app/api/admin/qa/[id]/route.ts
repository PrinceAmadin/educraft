import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { getQaReviewDetail } from "@/lib/services/operations/qa-reviews";
import { opsError } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET — everything the review screen shows: the project, both checklists, the review record. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const detail = await getQaReviewDetail(params.id);
    if (!detail) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/qa/[id]", error);
  }
}
