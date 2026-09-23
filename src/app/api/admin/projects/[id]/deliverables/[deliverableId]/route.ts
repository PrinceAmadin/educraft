import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin } from "@/lib/api";
import { fileActionError } from "@/lib/files/route-errors";
import { updateDeliverable } from "@/lib/services/deliverables";
import { updateDeliverableSchema } from "@/lib/validations/deliverables";

export const dynamic = "force-dynamic";

/** PATCH { title?, access?, archived? }: rename, change when the client can download, archive or restore. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; deliverableId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = updateDeliverableSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Nothing to change");

  try {
    await updateDeliverable({
      projectIdOrCode: params.id,
      deliverableId: params.deliverableId,
      ...parsed.data,
      actor: { userId: guard.session.userId, role: guard.session.role },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fileActionError("PATCH /api/admin/projects/[id]/deliverables/[deliverableId]", error);
  }
}
