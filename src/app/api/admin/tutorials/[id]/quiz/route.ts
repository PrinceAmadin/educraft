import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { TrainingError, createQuizQuestion, listQuizQuestions } from "@/lib/services/training";
import { createQuizQuestionSchema } from "@/lib/validations/training";

/**
 * The quiz questions on a worker training episode. Founder only (the answers
 * are here): the `/api/admin/tutorials` row admits the COO for progress, so
 * every quiz-authoring handler re-checks `requireSuperAdmin`.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    const questions = await listQuizQuestions(params.id);
    return NextResponse.json({ questions });
  } catch (error) {
    if (error instanceof TrainingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("tutorials-quiz-list", error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = createQuizQuestionSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const created = await createQuizQuestion(params.id, parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof TrainingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("tutorials-quiz-create", error);
  }
}
