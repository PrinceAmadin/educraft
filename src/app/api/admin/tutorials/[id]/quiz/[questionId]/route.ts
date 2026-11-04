import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { TrainingError, deleteQuizQuestion, updateQuizQuestion } from "@/lib/services/training";
import { updateQuizQuestionSchema } from "@/lib/validations/training";

/** Edit or delete one quiz question. Founder only (see the quiz list route). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; questionId: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = updateQuizQuestionSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await updateQuizQuestion(params.questionId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TrainingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("tutorials-quiz-update", error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; questionId: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    await deleteQuizQuestion(params.questionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TrainingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("tutorials-quiz-delete", error);
  }
}
