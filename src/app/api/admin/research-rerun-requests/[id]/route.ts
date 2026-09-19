import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { RerunRequestError, reviewRerunRequest } from "@/lib/services/research-runs";
import { reviewRerunBodySchema } from "@/lib/validations/research";

/** Approve or decline a worker's request for another research re-run. Any manager or admin. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = reviewRerunBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await reviewRerunRequest({
      requestId: params.id,
      reviewerId: guard.session.userId,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RerunRequestError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/research-rerun-requests/[id]", error);
  }
}
