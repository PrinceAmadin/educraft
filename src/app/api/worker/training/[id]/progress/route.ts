import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { TrainingError, saveTrainingProgress } from "@/lib/services/training";
import { trainingProgressSchema } from "@/lib/validations/training";

/**
 * How far the signed-in worker has watched one training episode. The viewer
 * is the session, so there is nothing in the body to tamper with, and the
 * series' sequential unlock is enforced here — a hand-crafted request cannot
 * watch episode four before episode one (403). The middleware does not cover
 * /api/worker, so `requireWorker` is the check.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = trainingProgressSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await saveTrainingProgress(guard.userId, params.id, parsed.data, {
      audience: "WORKER",
      enforceOrder: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TrainingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverError("worker-training-progress", error);
  }
}
