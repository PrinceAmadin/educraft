import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { ScreeningError } from "@/lib/services/screening";
import { sendFinalAssessment } from "@/lib/services/final-practical";

/**
 * Sends the Stage-3 final assessment for a pending worker application and emails
 * the candidate the link. Founder + COO (`/api/admin/workers` in the table).
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const result = await sendFinalAssessment(params.id, guard.session.userId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("final-send", error);
  }
}
