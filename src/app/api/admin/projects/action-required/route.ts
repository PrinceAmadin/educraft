import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { getActionRequired } from "@/lib/services/operations/pipeline";
import { opsError } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** The projects that need the COO's hand today, most urgent first. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await getActionRequired(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/projects/action-required", error);
  }
}
