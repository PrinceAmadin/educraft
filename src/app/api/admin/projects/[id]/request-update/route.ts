import { NextRequest, NextResponse } from "next/server";
import { requestClientUpdate } from "@/lib/services/operations/project-ops";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { requestClientUpdateBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/** POST { message } — ask the client for something through their dashboard thread. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, requestClientUpdateBodySchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await requestClientUpdate(params.id, guard.actor, body.data.message), { status: 201 });
  } catch (error) {
    return opsError("POST /api/admin/projects/[id]/request-update", error);
  }
}
