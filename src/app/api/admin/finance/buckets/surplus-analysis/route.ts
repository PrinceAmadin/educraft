import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { monthKeySchema } from "@/lib/validations/finance-buckets";
import { currentMonthKey, getSurplusAnalysis } from "@/lib/services/finance/surplus";

/** The semester-end surplus analysis for the semester containing `?month=` (default: now). Founder and CFO. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const raw = req.nextUrl.searchParams.get("month");
  const parsed = raw ? monthKeySchema.safeParse(raw) : null;
  if (parsed && !parsed.success) return badRequest("Use YYYY-MM");
  try {
    return NextResponse.json(await getSurplusAnalysis(parsed?.success ? parsed.data : currentMonthKey()));
  } catch (error) {
    return serverError("GET /api/admin/finance/buckets/surplus-analysis", error);
  }
}
