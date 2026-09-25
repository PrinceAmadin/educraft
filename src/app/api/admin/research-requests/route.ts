import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { listResearchRequests } from "@/lib/services/operations/research-requests";
import { researchRequestsQuerySchema } from "@/lib/validations/operations";
import { opsError, parseQuery } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET ?status=pending,running,complete — research runs and approvals, pending first. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { status } = parseQuery(req, researchRequestsQuerySchema);
    return NextResponse.json({ requests: await listResearchRequests({ status }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/research-requests", error);
  }
}
