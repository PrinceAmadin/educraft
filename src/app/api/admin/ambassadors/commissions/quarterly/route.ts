import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { CommissionsError, currentQuarterKey, getQuarterTracker } from "@/lib/services/ambassador-platform/commissions";
import { quarterQuerySchema } from "@/lib/validations/ambassador-platform";

/** The quarterly bonus tracker: Platinum per-client bonuses and the 10-client challenge. `?quarter=Q3-2026`. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const q = quarterQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  try {
    return NextResponse.json(await getQuarterTracker(q.quarter ?? currentQuarterKey()));
  } catch (error) {
    if (error instanceof CommissionsError) return NextResponse.json({ error: error.message }, { status: 400 });
    return serverError("GET /api/admin/ambassadors/commissions/quarterly", error);
  }
}
