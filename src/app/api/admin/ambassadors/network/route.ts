import { NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getNetworkMap } from "@/lib/services/ambassador-platform/network";

/** The Core/Sub structure: clusters (Core + Sub-team), solo ambassadors and the structure stats. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await getNetworkMap());
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/network", error);
  }
}
