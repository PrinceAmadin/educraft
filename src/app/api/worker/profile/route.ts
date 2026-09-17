import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { updateOwnWorkerProfile } from "@/lib/services/workers";
import { selfUpdateWorkerSchema } from "@/lib/validations/workers";

/**
 * A worker editing their own intake info (phone, email, education,
 * specialties, skills, bank details). Scoped to guard.workerId — resolved
 * server-side from the caller's session, never from the request — so a
 * worker can never reach another worker's record through this endpoint.
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = selfUpdateWorkerSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await updateOwnWorkerProfile(guard.workerId, guard.userId, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return serverError("PATCH /api/worker/profile", error);
  }
}
