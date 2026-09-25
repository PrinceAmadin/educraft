import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { contentConsistency, getCampaign, monthCalendar } from "@/lib/services/ambassador-platform/content";
import { currentMonthKey } from "@/lib/services/finance/surplus";
import { contentMonthQuerySchema } from "@/lib/validations/ambassador-platform";

/** The Content Hub: the month's calendar (`?month=YYYY-MM`), 12-week consistency and the pre-season campaign. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const q = contentMonthQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  try {
    const now = new Date();
    const [calendar, consistency, campaign] = await Promise.all([monthCalendar(q.month ?? currentMonthKey(now), now), contentConsistency(now), getCampaign(now)]);
    return NextResponse.json({ calendar, consistency, campaign });
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/content", error);
  }
}
