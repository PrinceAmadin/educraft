import { NextRequest, NextResponse } from "next/server";
import { resolveWorkerFlag } from "@/lib/services/operations/workers-ops";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { workerFlagResolveBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/** PATCH { note? } — resolve a flag on the worker. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; flagId: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, workerFlagResolveBodySchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await resolveWorkerFlag(params.flagId, guard.actor, body.data.note));
  } catch (error) {
    return opsError("PATCH /api/admin/workers/[id]/flags/[flagId]", error);
  }
}
