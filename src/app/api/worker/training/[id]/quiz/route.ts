import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { TrainingError, getQuizForViewer, submitQuizAttempt } from "@/lib/services/training";
import { quizSubmitSchema } from "@/lib/validations/training";

/**
 * The quiz on one worker training episode. GET serves the questions with the
 * options shuffled and the answers withheld; POST submits and is scored on the
 * server, which never sends `correctIndex` down. The viewer is the session, so
 * there is nothing in the body to tamper with, and both refuse an episode the
 * worker has not watched (403). The middleware does not cover /api/worker, so
 * `requireWorker` is the check.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const quiz = await getQuizForViewer(guard.userId, params.id);
    return NextResponse.json(quiz);
  } catch (error) {
    if (error instanceof TrainingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("worker-quiz-get", error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = quizSubmitSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const outcome = await submitQuizAttempt(guard.userId, params.id, parsed.data.answers);
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof TrainingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("worker-quiz-post", error);
  }
}
