import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { getOperationsReport } from "@/lib/services/operations/reports";
import { operationsReportQuerySchema } from "@/lib/validations/operations";
import { opsError, parseQuery } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET ?month=2026-09 — the whole operations report (headline, timing, league, departments, corrections). */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { month } = parseQuery(req, operationsReportQuerySchema);
    return NextResponse.json(await getOperationsReport(month), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/reports/operations", error);
  }
}
