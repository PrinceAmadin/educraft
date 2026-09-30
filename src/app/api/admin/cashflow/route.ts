import { NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getActiveCashflowOrNull, level1KeysWithRecords, listCashflowVersions, minServiceDownpayment } from "@/lib/services/cashflow";
import { listStaffForAssignment } from "@/lib/services/cashflow-staff";

export const dynamic = "force-dynamic";

/** The active structure, the version history and what the editor needs to validate. Every executive may read it. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const [active, history, keysWithRecords, minDownpayment, staff] = await Promise.all([
      getActiveCashflowOrNull(),
      listCashflowVersions(),
      level1KeysWithRecords(),
      minServiceDownpayment(),
      listStaffForAssignment(),
    ]);
    return NextResponse.json({ active, history, keysWithRecords, minServiceDownpayment: minDownpayment, staff }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/admin/cashflow", error);
  }
}
