import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { getHogBudget } from "@/lib/services/expenses";
import { currentMonthKey } from "@/lib/services/finance/surplus";

/** The HOG's sponsorship budget for a quarter (`?quarter=Q3-2026` or `?month=2026-09`). Founder, CFO and HOG. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO", "HOG"]);
  if (!guard.ok) return guard.response;
  const quarter = req.nextUrl.searchParams.get("quarter");
  const monthParam = req.nextUrl.searchParams.get("month");
  let month = currentMonthKey();
  if (quarter) {
    const m = /^Q([1-4])-(\d{4})$/.exec(quarter);
    if (!m) return badRequest("Use Q1-2026 … Q4-2026");
    month = `${m[2]}-${String((Number(m[1]) - 1) * 3 + 1).padStart(2, "0")}`;
  } else if (monthParam) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) return badRequest("Use YYYY-MM");
    month = monthParam;
  }
  try {
    return NextResponse.json(await getHogBudget(month));
  } catch (error) {
    return serverError("GET /api/admin/finance/expenses/hog-budget", error);
  }
}
