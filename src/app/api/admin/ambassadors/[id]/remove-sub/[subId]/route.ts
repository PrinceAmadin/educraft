import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { DirectoryError, removeSubAmbassador } from "@/lib/services/ambassador-platform/directory";

/** Take a Sub out of this Core's team. Past commission rows are untouched; only future jobs stop paying the override. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; subId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    await removeSubAmbassador(params.id, params.subId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DirectoryError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("DELETE /api/admin/ambassadors/[id]/remove-sub/[subId]", error);
  }
}
