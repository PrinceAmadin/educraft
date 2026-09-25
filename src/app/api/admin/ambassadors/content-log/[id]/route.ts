import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { deleteContentLog } from "@/lib/services/ambassador-platform/content";

/** Undo a post logged by mistake. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const removed = await deleteContentLog(params.id);
    if (!removed) return NextResponse.json({ error: "That post is not on record" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("DELETE /api/admin/ambassadors/content-log/[id]", error);
  }
}
