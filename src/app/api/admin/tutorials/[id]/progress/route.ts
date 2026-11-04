import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { TrainingError, saveTrainingProgress } from "@/lib/services/training";
import { trainingProgressSchema } from "@/lib/validations/training";

/**
 * How far the signed-in executive has watched one COO tutorial. The founder
 * and the COO (the tutorials page's audience); the viewer is the session, so
 * there is nothing in the body to tamper with. No order is enforced — the
 * tutorials are a library, not a gate.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
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
    const result = await saveTrainingProgress(guard.session.userId, params.id, parsed.data, {
      audience: "COO",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TrainingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverError("tutorials-progress", error);
  }
}
