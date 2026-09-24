import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { activateAmbassador, DirectoryError } from "@/lib/services/ambassador-platform/directory";

/** Reactivate a suspended (or paused / lapsed) ambassador and switch their login back on. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    await activateAmbassador(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DirectoryError) {
      return NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    }
    return serverError("POST /api/admin/ambassadors/[id]/activate", error);
  }
}
