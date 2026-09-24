import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { getFinanceReport, ReportError, type ReportType } from "@/lib/services/finance/reports";

const TYPES: ReportType[] = ["monthly", "semester", "annual"];

/** `?type=monthly&period=2026-09` | `semester&period=2026-S2` | `annual&period=2026`. Founder and CFO. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const type = (req.nextUrl.searchParams.get("type") ?? "monthly") as ReportType;
  if (!TYPES.includes(type)) return badRequest("type must be monthly, semester or annual");
  try {
    return NextResponse.json(await getFinanceReport(type, req.nextUrl.searchParams.get("period")));
  } catch (error) {
    if (error instanceof ReportError) return badRequest(error.message);
    return serverError("GET /api/admin/finance/reports", error);
  }
}
