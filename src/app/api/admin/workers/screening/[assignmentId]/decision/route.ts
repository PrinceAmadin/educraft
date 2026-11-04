import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { ScreeningError, decideScreening } from "@/lib/services/screening";
import { decideScreeningSchema } from "@/lib/validations/screening";

/**
 * The COO's (or founder's) decision on a submitted screening: PASS moves the
 * application to SCREEN_PASSED; FAIL declines it with the usual polite email.
 */
export async function POST(req: NextRequest, { params }: { params: { assignmentId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = decideScreeningSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await decideScreening(params.assignmentId, parsed.data.decision, guard.session.userId, parsed.data.note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("screening-decision", error);
  }
}
