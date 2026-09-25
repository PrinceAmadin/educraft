import { NextRequest, NextResponse } from "next/server";
import { linkParentProject } from "@/lib/services/operations/project-ops";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { parentProjectBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/** PATCH { parentCode | null } — link this project as a follow-on to another (or unlink it). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, parentProjectBodySchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await linkParentProject(params.id, guard.actor, body.data.parentCode));
  } catch (error) {
    return opsError("PATCH /api/admin/projects/[id]/parent", error);
  }
}
