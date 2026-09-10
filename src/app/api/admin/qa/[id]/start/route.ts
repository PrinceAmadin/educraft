import { NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { startQaReview } from "@/lib/services/qa";
import { TransitionError } from "@/lib/services/projects";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    await startQaReview(params.id, guard.session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/qa/[id]/start", error);
  }
}
