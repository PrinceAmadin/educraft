import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { getRecommendedWorkers } from "@/lib/services/operations/workers-ops";
import { opsError } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET ?projectId=EC-XXXXX — workers ranked for this project: department match, then load, then rating. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const projectId = new URL(req.url).searchParams.get("projectId")?.trim();
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  try {
    const result = await getRecommendedWorkers(projectId);
    if (!result) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/workers/recommended", error);
  }
}
