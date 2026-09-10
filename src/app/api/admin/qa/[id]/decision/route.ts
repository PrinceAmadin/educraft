import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { submitQaDecision } from "@/lib/services/qa";
import { TransitionError } from "@/lib/services/projects";
import { qaDecisionBodySchema } from "@/lib/validations/qa";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = qaDecisionBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await submitQaDecision(params.id, parsed.data, guard.session.userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/qa/[id]/decision", error);
  }
}
