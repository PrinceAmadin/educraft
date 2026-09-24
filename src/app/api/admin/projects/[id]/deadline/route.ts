import { NextRequest, NextResponse } from "next/server";
import { setInternalDeadline } from "@/lib/services/operations/project-ops";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { internalDeadlineBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/** PATCH { date: "YYYY-MM-DD" | null, note? } — the internal deadline (never shown to clients). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, internalDeadlineBodySchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await setInternalDeadline(params.id, guard.actor, body.data.date, body.data.note));
  } catch (error) {
    return opsError("PATCH /api/admin/projects/[id]/deadline", error);
  }
}
