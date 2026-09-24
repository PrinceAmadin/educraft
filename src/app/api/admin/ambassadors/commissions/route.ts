import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getCommissionMonth } from "@/lib/services/ambassador-platform/commissions";
import { currentMonthKey } from "@/lib/services/finance/surplus";
import { commissionMonthQuerySchema } from "@/lib/validations/ambassador-platform";

/** Current-month commissions per ambassador (from PayoutRecord) plus the WhatsApp earnings update. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const q = commissionMonthQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  try {
    return NextResponse.json(await getCommissionMonth(q.month ?? currentMonthKey()));
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/commissions", error);
  }
}
