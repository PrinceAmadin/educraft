import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { revenueQuerySchema } from "@/lib/validations/finance";
import { getRevenueSummary, listRevenue } from "@/lib/services/finance/revenue";

/** The Revenue Tracker's rows, filtered and paged, plus the month's summary. Founder and CFO. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  const parsed = revenueQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest("Check the filters", parsed.error.flatten());

  try {
    const [list, summary] = await Promise.all([listRevenue(parsed.data), getRevenueSummary()]);
    return NextResponse.json({ ...list, summary });
  } catch (error) {
    return serverError("GET /api/admin/finance/revenue", error);
  }
}
