import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { ScreeningError, sendScreening } from "@/lib/services/screening";

/**
 * Sends the Stage-1 screening test for a pending worker application and emails
 * the candidate the link. Any staff member who can reach the applications page
 * (founder + COO); `/api/admin/workers` is SA + COO in the permission table.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const result = await sendScreening(params.id, guard.session.userId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("screening-send", error);
  }
}
