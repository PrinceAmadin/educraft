import { NextResponse } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { listOutstandingBalances } from "@/lib/services/finance/revenue";

/** Projects with the downpayment in and the balance still owed, aged. Founder and CFO. */
export async function GET() {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await listOutstandingBalances());
  } catch (error) {
    return serverError("GET /api/admin/finance/revenue/outstanding", error);
  }
}
