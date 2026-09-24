import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { approveResearchRequest, denyResearchRequest, getResearchProgress } from "@/lib/services/operations/research-requests";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { researchDenyBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/** GET /progress — where the pipeline is, step by step, with counts and an estimate. */
export async function GET(_req: NextRequest, { params }: { params: { id: string; action: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  if (params.action !== "progress") return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  try {
    return NextResponse.json(await getResearchProgress(params.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/research-requests/[id]/progress", error);
  }
}

/** POST /approve · POST /deny { reason } */
export async function POST(req: NextRequest, { params }: { params: { id: string; action: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  try {
    switch (params.action) {
      case "approve":
        return NextResponse.json(await approveResearchRequest(params.id, guard.actor));
      case "deny": {
        const body = await parseBody(req, researchDenyBodySchema);
        if (!body.ok) return body.response;
        return NextResponse.json(await denyResearchRequest(params.id, guard.actor, body.data.reason));
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    }
  } catch (error) {
    return opsError(`POST /api/admin/research-requests/[id]/${params.action}`, error);
  }
}
