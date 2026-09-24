import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { PartnershipError, unlinkAmbassador } from "@/lib/services/ambassador-platform/partnerships";

/** Take an ambassador off this partnership's channel. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; ambassadorId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    await unlinkAmbassador(params.id, params.ambassadorId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PartnershipError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("DELETE /api/admin/ambassadors/partnerships/[id]/ambassadors/[ambassadorId]", error);
  }
}
