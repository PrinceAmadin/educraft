import { NextResponse } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { listCashflowAudit } from "@/lib/services/cashflow";

/** The cashflow / money-settings change history (founder + CFO). Read-only. */
export async function GET() {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ entries: await listCashflowAudit() });
  } catch (error) {
    return serverError("GET /api/admin/cashflow/audit", error);
  }
}
