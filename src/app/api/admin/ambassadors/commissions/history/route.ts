import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getCommissionHistory } from "@/lib/services/ambassador-platform/commissions";
import { commissionHistoryQuerySchema } from "@/lib/validations/ambassador-platform";

/** Every ambassador payout record, all time: `?q=&month=&status=&tier=&page=`. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const q = commissionHistoryQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  try {
    return NextResponse.json(await getCommissionHistory(q));
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/commissions/history", error);
  }
}
