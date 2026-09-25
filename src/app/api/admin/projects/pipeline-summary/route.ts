import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { getPipelineSummary } from "@/lib/services/operations/pipeline";
import { opsError } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** Counts per pipeline stage, with what needs a look in each. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await getPipelineSummary(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/projects/pipeline-summary", error);
  }
}
