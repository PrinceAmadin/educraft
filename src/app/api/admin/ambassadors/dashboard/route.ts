import { NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getAmbassadorDashboard } from "@/lib/services/ambassador-platform/dashboard";

/** The Ambassador Dashboard's numbers (what /admin/ambassadors renders). */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await getAmbassadorDashboard());
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/dashboard", error);
  }
}
