import { NextResponse } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { getFinanceDashboard } from "@/lib/services/finance/dashboard";

/** This month against last, bucket health, what needs attention, six months of revenue vs payouts. Founder and CFO. */
export async function GET() {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  try {
    const data = await getFinanceDashboard();
    return NextResponse.json({
      ...data,
      bucketBalances: Object.fromEntries(data.buckets.map((b) => [b.bucket, b.balance])),
    });
  } catch (error) {
    return serverError("GET /api/admin/finance/dashboard", error);
  }
}
