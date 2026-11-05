import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { ScreeningError } from "@/lib/services/screening";
import { decideFinalAssessment } from "@/lib/services/final-practical";

const schema = z.object({ decision: z.enum(["PASS", "FAIL"]), note: z.string().trim().max(1000).optional() });

/** The COO's decision on a submitted final assessment: PASS approves the worker, FAIL declines. */
export async function POST(req: NextRequest, { params }: { params: { assessmentId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
  try {
    await decideFinalAssessment(params.assessmentId, parsed.data.decision, guard.session.userId, parsed.data.note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("final-decision", error);
  }
}
